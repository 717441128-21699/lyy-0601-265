import { TaskManager } from './TaskManager';
import { CalendarManager } from './CalendarManager';
import { ReminderManager } from './ReminderManager';
import { GoalManager } from './GoalManager';
import { StatisticsManager } from './StatisticsManager';
import { ReviewManager } from './ReviewManager';
import { TemplateManager } from './TemplateManager';

import {
  Task,
  CalendarBlock,
  Reminder,
  Goal,
  DailyPlan,
  CheckInRecord,
  EfficiencyScore,
  WeeklyReview,
  TaskTemplate,
  ExportSummary,
  PlanningResult,
  TimeConflict,
  SDKOptions,
  UserAction,
  Priority,
  TaskStatus,
  RepeatFrequency,
} from '../types';

import { addDays, startOfDay, sortTasksByPriority, formatDate } from '../utils';

export class EfficiencySDK {
  private taskManager: TaskManager;
  private calendarManager: CalendarManager;
  private reminderManager: ReminderManager;
  private goalManager: GoalManager;
  private statisticsManager: StatisticsManager;
  private reviewManager: ReviewManager;
  private templateManager: TemplateManager;
  private options: SDKOptions;

  constructor(options?: SDKOptions) {
    this.options = {
      workStartTime: '09:00',
      workEndTime: '18:00',
      workDays: [1, 2, 3, 4, 5],
      defaultEstimatedMinutes: 30,
      reminderLeadMinutes: 15,
      ...options,
    };

    this.taskManager = new TaskManager();
    this.calendarManager = new CalendarManager();
    this.reminderManager = new ReminderManager();
    this.goalManager = new GoalManager();
    this.statisticsManager = new StatisticsManager();
    this.reviewManager = new ReviewManager();
    this.templateManager = new TemplateManager();

    if (this.options.reminderLeadMinutes) {
      this.reminderManager.setDefaultLeadMinutes(this.options.reminderLeadMinutes);
    }
  }

  get tasks() {
    return this.taskManager;
  }

  get calendar() {
    return this.calendarManager;
  }

  get reminders() {
    return this.reminderManager;
  }

  get goals() {
    return this.goalManager;
  }

  get statistics() {
    return this.statisticsManager;
  }

  get reviews() {
    return this.reviewManager;
  }

  get templates() {
    return this.templateManager;
  }

  plan(params: {
    date: Date;
    tasks?: Task[];
    days?: number;
  }): PlanningResult {
    const { date, days = 1 } = params;

    let allTasks: Task[];
    if (params.tasks) {
      params.tasks.forEach((t) => {
        if (!this.taskManager.getTask(t.id)) {
          this.taskManager.createTask({
            title: t.title,
            description: t.description,
            priority: t.priority,
            estimatedMinutes: t.estimatedMinutes,
            dueDate: t.dueDate,
            startDate: t.startDate,
            tags: t.tags,
          });
        }
      });
      allTasks = this.taskManager.getAllTasks();
    } else {
      allTasks = this.taskManager.getAllTasks();
    }

    const dailyPlans: DailyPlan[] = [];
    const allCalendarBlocks: CalendarBlock[] = [];
    const allReminders: Reminder[] = [];
    const allConflicts: TimeConflict[] = [];
    const suggestions: string[] = [];

    for (let i = 0; i < days; i++) {
      const planDate = addDays(date, i);
      const dayPlan = this.statisticsManager.generateDailyPlan(
        planDate,
        allTasks,
        this.calendarManager.getAllBlocks()
      );
      dailyPlans.push(dayPlan);

      dayPlan.tasks.forEach((task) => {
        if (task.calendarBlockIds.length === 0) {
          const block = this.calendarManager.scheduleTaskBlock(
            task,
            planDate,
            this.options.workStartTime,
            this.options.workEndTime
          );
          if (block) {
            this.taskManager.updateTask(task.id, {
              calendarBlockIds: [...task.calendarBlockIds, block.id],
            });
          }
        }
      });

      const dayBlocks = this.calendarManager.getBlocksForDate(planDate);
      allCalendarBlocks.push(...dayBlocks);

      const conflicts = this.calendarManager.detectConflicts();
      allConflicts.push(...conflicts);

      dayPlan.tasks.forEach((task) => {
        const taskReminders = this.reminderManager.generateRemindersForTask(task, {
          startReminder: true,
          dueReminder: true,
          leadMinutes: this.options.reminderLeadMinutes,
        });
        allReminders.push(...taskReminders);
      });
    }

    if (allConflicts.length > 0) {
      suggestions.push(`检测到 ${allConflicts.length} 个时间冲突，建议重新安排日程。`);
    }

    const highPriorityCount = dailyPlans[0]?.tasks.filter(
      (t) => t.priority === 'high' || t.priority === 'urgent'
    ).length;
    if (highPriorityCount && highPriorityCount > 5) {
      suggestions.push('今日高优先级任务较多，注意合理分配精力。');
    }

    const totalEstimated = dailyPlans.reduce((sum, p) => sum + p.totalEstimatedMinutes, 0);
    const workMinutesPerDay = this.calculateWorkMinutesPerDay();
    if (days === 1 && totalEstimated > workMinutesPerDay) {
      suggestions.push('今日任务量超过工作时长，建议将部分任务延后。');
    }

    return {
      tasks: sortTasksByPriority(allTasks),
      calendarBlocks: allCalendarBlocks,
      reminders: allReminders,
      dailyPlans,
      suggestions,
      conflicts: allConflicts,
    };
  }

  handleAction(action: UserAction): PlanningResult | any {
    const { type, payload, timestamp } = action;

    switch (type) {
      case 'create_task':
        return this.taskManager.createTask(payload as any);

      case 'complete_task':
        this.taskManager.setTaskStatus(payload.taskId, 'completed');
        this.updateGoalProgress();
        return this.taskManager.getTask(payload.taskId);

      case 'defer_task':
        return this.taskManager.deferTask(payload.taskId, payload.deferredTo, payload.reason);

      case 'schedule_task':
        const block = this.calendarManager.scheduleTaskBlock(
          payload.task,
          payload.date,
          this.options.workStartTime,
          this.options.workEndTime
        );
        if (block) {
          const task = this.taskManager.getTask(payload.task.id);
          if (task) {
            this.taskManager.updateTask(payload.task.id, {
              calendarBlockIds: [...task.calendarBlockIds, block.id],
            });
          }
          this.reminderManager.generateCalendarReminder(block);
        }
        return block;

      case 'check_in':
        return this.statisticsManager.checkIn(payload as any);

      case 'create_goal':
        return this.goalManager.createGoal(payload as any);

      case 'apply_template':
        const templateTasks = this.templateManager.applyTemplate(
          payload.templateId,
          payload.startDate || new Date(),
          {
            goalId: payload.goalId,
            tagOverrides: payload.tagOverrides,
          }
        );
        const createdTasks: Task[] = [];
        templateTasks.forEach((t) => {
          const task = this.taskManager.createTask({
            title: t.title,
            description: t.description,
            priority: t.priority,
            estimatedMinutes: t.estimatedMinutes,
            dueDate: t.dueDate,
            tags: t.tags,
            goalId: t.goalId,
          });
          createdTasks.push(task);
        });
        return createdTasks;

      case 'generate_weekly_review':
        return this.reviewManager.generateWeeklyReview(
          payload.date || new Date(),
          this.taskManager.getAllTasks(),
          this.goalManager.getAllGoals()
        );

      case 'generate_summary':
        return this.templateManager.generateExportSummary(
          payload.startDate,
          payload.endDate,
          this.taskManager.getAllTasks(),
          this.goalManager.getAllGoals().map((g) => ({
            id: g.id,
            title: g.title,
            progress: g.progress,
            status: g.status,
          }))
        );

      case 'get_plan':
        return this.plan({
          date: payload.date || new Date(),
          days: payload.days || 1,
        });

      default:
        return { error: `Unknown action type: ${type}` };
    }
  }

  getTodayPlan(): DailyPlan {
    return this.statisticsManager.generateDailyPlan(
      new Date(),
      this.taskManager.getAllTasks(),
      this.calendarManager.getAllBlocks()
    );
  }

  getWeeklyPlan(startDate?: Date): DailyPlan[] {
    const start = startDate || new Date();
    return this.statisticsManager.generateWeeklyPlans(
      start,
      this.taskManager.getAllTasks(),
      this.calendarManager.getAllBlocks()
    );
  }

  getWeeklyReview(date?: Date): WeeklyReview {
    return this.reviewManager.generateWeeklyReview(
      date || new Date(),
      this.taskManager.getAllTasks(),
      this.goalManager.getAllGoals()
    );
  }

  getEfficiencyScore(date?: Date): EfficiencyScore {
    return this.statisticsManager.calculateEfficiencyScore(
      date || new Date(),
      this.taskManager.getAllTasks(),
      this.goalManager.getAllGoals()
    );
  }

  checkIn(params: {
    completedTasks?: string[];
    completedMinutes?: number;
    mood?: string;
    note?: string;
  }): CheckInRecord {
    const tasks = params.completedTasks || [];

    tasks.forEach((taskId) => {
      this.taskManager.setTaskStatus(taskId, 'completed');
    });

    this.updateGoalProgress();

    return this.statisticsManager.checkIn({
      completedTasks: tasks,
      completedMinutes: params.completedMinutes || 0,
      mood: params.mood,
      note: params.note,
    });
  }

  private updateGoalProgress(): void {
    const allGoals = this.goalManager.getAllGoals();
    const allTasks = this.taskManager.getAllTasks();

    allGoals.forEach((goal) => {
      this.goalManager.recalculateProgress(goal.id, allTasks);
    });
  }

  private calculateWorkMinutesPerDay(): number {
    if (!this.options.workStartTime || !this.options.workEndTime) {
      return 480;
    }

    const [startHour, startMin] = this.options.workStartTime.split(':').map(Number);
    const [endHour, endMin] = this.options.workEndTime.split(':').map(Number);

    return (endHour - startHour) * 60 + (endMin - startMin);
  }

  exportData(): {
    tasks: Task[];
    calendarBlocks: CalendarBlock[];
    reminders: Reminder[];
    goals: Goal[];
    checkIns: CheckInRecord[];
    templates: TaskTemplate[];
    options: SDKOptions;
  } {
    return {
      tasks: this.taskManager.getAllTasks(),
      calendarBlocks: this.calendarManager.getAllBlocks(),
      reminders: this.reminderManager.getAllReminders(),
      goals: this.goalManager.getAllGoals(),
      checkIns: this.statisticsManager.getAllCheckIns(),
      templates: this.templateManager.getAllTemplates(),
      options: this.options,
    };
  }

  importData(data: {
    tasks?: Task[];
    calendarBlocks?: CalendarBlock[];
    reminders?: Reminder[];
    goals?: Goal[];
    checkIns?: CheckInRecord[];
    templates?: TaskTemplate[];
    options?: SDKOptions;
  }): void {
    if (data.options) {
      this.options = { ...this.options, ...data.options };
    }
  }

  getStats() {
    return this.statisticsManager.getTotalStats(this.taskManager.getAllTasks());
  }

  filterTasks(options: {
    status?: TaskStatus[];
    priority?: Priority[];
    tags?: string[];
    dueBefore?: Date;
    dueAfter?: Date;
    goalId?: string;
  }): Task[] {
    return this.taskManager.filterTasks(options);
  }

  getTasksByTag(tag: string): Task[] {
    return this.taskManager.getTasksByTag(tag);
  }

  getTasksByPriority(priority: Priority): Task[] {
    return this.taskManager.getTasksByPriority(priority);
  }

  getStreak(): number {
    return this.statisticsManager.getStreak();
  }

  generateSummary(startDate: Date, endDate: Date): ExportSummary {
    return this.templateManager.generateExportSummary(
      startDate,
      endDate,
      this.taskManager.getAllTasks(),
      this.goalManager.getAllGoals().map((g) => ({
        id: g.id,
        title: g.title,
        progress: g.progress,
        status: g.status,
      }))
    );
  }
}

export default EfficiencySDK;
