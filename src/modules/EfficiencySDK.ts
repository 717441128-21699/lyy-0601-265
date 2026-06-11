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
  BatchActionResult,
} from '../types';

import { addDays, sortTasksByPriority, startOfWeek, endOfWeek } from '../utils';

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
    autoSchedule?: boolean;
    generateReminders?: boolean;
  }): PlanningResult {
    const { date, days = 1, autoSchedule = true, generateReminders = true } = params;

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
    }

    const allTasks = this.taskManager.getAllTasks();

    if (autoSchedule) {
      this.autoScheduleTasks(allTasks, date, days);
    }

    if (generateReminders) {
      this.generateAllReminders(allTasks);
    }

    const allCalendarBlocks = this.calendarManager.getAllBlocks();
    const allReminders = this.reminderManager.getAllReminders();
    const allConflicts = this.calendarManager.detectConflicts();

    const dailyPlans: DailyPlan[] = [];
    const suggestions: string[] = [];

    for (let i = 0; i < days; i++) {
      const planDate = addDays(date, i);
      const dayConflicts = allConflicts.filter((c) => {
        const block1 = c.block1 as any;
        const block2 = c.block2 as any;
        const time1 = block1.startTime || block1.dueDate;
        const time2 = block2.startTime || block2.dueDate;
        return (time1 && this.isSameDay(time1, planDate)) ||
               (time2 && this.isSameDay(time2, planDate));
      });

      const dayPlan = this.statisticsManager.generateDailyPlan(
        planDate,
        allTasks,
        allCalendarBlocks,
        {
          reminders: allReminders,
          conflicts: dayConflicts,
          workStartTime: this.options.workStartTime,
          workEndTime: this.options.workEndTime,
        }
      );

      dailyPlans.push(dayPlan);
    }

    if (allConflicts.length > 0) {
      suggestions.push(`检测到 ${allConflicts.length} 个时间冲突，建议重新安排日程。`);
    }

    const firstDayPlan = dailyPlans[0];
    if (firstDayPlan && firstDayPlan.tasks.filter(
      (t) => t.priority === 'high' || t.priority === 'urgent'
    ).length > 5) {
      suggestions.push('今日高优先级任务较多，注意合理分配精力。');
    }

    if (firstDayPlan && firstDayPlan.freeMinutes < 60 && firstDayPlan.freeMinutes > 0) {
      suggestions.push('今日日程较满，建议预留休息时间避免疲劳。');
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

  private autoScheduleTasks(tasks: Task[], startDate: Date, days: number): void {
    const pendingTasks = tasks.filter(
      (t) => t.status !== 'completed' && t.status !== 'cancelled'
    );

    const sortedTasks = sortTasksByPriority(pendingTasks);

    for (let i = 0; i < days; i++) {
      const planDate = addDays(startDate, i);

      for (const task of sortedTasks) {
        const hasBlock = task.calendarBlockIds.length > 0;
        const isForDay = (task.dueDate && this.isSameDay(task.dueDate, planDate)) ||
                         (task.startDate && this.isSameDay(task.startDate, planDate));

        if (!hasBlock && isForDay) {
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
      }
    }
  }

  private generateAllReminders(tasks: Task[]): void {
    tasks.forEach((task) => {
      const existingReminders = this.reminderManager.getRemindersByTask(task.id);
      if (existingReminders.length === 0 && (task.dueDate || task.startDate)) {
        this.reminderManager.generateRemindersForTask(task, {
          startReminder: true,
          dueReminder: true,
          leadMinutes: this.options.reminderLeadMinutes,
        });
      }
    });

    const blocks = this.calendarManager.getAllBlocks();
    blocks.forEach((block) => {
      const existingReminders = this.reminderManager.getRemindersByCalendarBlock(block.id);
      if (existingReminders.length === 0) {
        this.reminderManager.generateCalendarReminder(block, this.options.reminderLeadMinutes);
      }
    });
  }

  private isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    );
  }

  handleAction(action: UserAction): any {
    try {
      return this.executeAction(action);
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  private executeAction(action: UserAction): any {
    const { type, payload } = action;

    switch (type) {
      case 'create_task': {
        const task = this.taskManager.createTask(payload as any);
        if (payload.autoSchedule && task.dueDate) {
          this.plan({ date: task.dueDate, days: 1 });
        }
        return { success: true, data: task };
      }

      case 'complete_task': {
        this.taskManager.setTaskStatus(payload.taskId, 'completed');
        this.updateGoalProgress();
        const task = this.taskManager.getTask(payload.taskId);
        return { success: true, data: task };
      }

      case 'defer_task': {
        const task = this.taskManager.deferTask(payload.taskId, payload.deferredTo, payload.reason);
        return { success: true, data: task };
      }

      case 'schedule_task': {
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
        return { success: true, data: block };
      }

      case 'check_in': {
        if (payload.completedTasks) {
          payload.completedTasks.forEach((taskId: string) => {
            this.taskManager.setTaskStatus(taskId, 'completed');
          });
        }
        this.updateGoalProgress();
        const result = this.statisticsManager.checkIn(payload as any);
        return { success: true, data: result };
      }

      case 'create_goal': {
        const goal = this.goalManager.createGoal(payload as any);
        return { success: true, data: goal };
      }

      case 'apply_template': {
        const createdTasks = this.applyTemplateToTasks(
          payload.templateId,
          payload.startDate || new Date(),
          {
            goalId: payload.goalId,
            parentTaskId: payload.parentTaskId,
            tagOverrides: payload.tagOverrides,
          }
        );

        if (payload.autoPlan && createdTasks.length > 0) {
          const firstTaskDate = createdTasks[0].dueDate || new Date();
          this.plan({ date: firstTaskDate, days: payload.planDays || 1 });
        }

        return { success: true, data: createdTasks };
      }

      case 'generate_weekly_review': {
        const review = this.reviewManager.generateWeeklyReview(
          payload.date || new Date(),
          this.taskManager.getAllTasks(),
          this.goalManager.getAllGoals()
        );
        return { success: true, data: review };
      }

      case 'generate_summary': {
        const summary = this.templateManager.generateExportSummary(
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
        return { success: true, data: summary };
      }

      case 'get_plan': {
        const plan = this.plan({
          date: payload.date || new Date(),
          days: payload.days || 1,
        });
        return { success: true, data: plan };
      }

      default:
        return { success: false, error: `Unknown action type: ${type}` };
    }
  }

  private applyTemplateToTasks(
    templateId: string,
    startDate: Date,
    options?: {
      goalId?: string;
      parentTaskId?: string;
      tagOverrides?: string[];
    }
  ): Task[] {
    const templateTasks = this.templateManager.applyTemplate(
      templateId,
      startDate,
      options
    );

    const createdTasks: Task[] = [];
    templateTasks.forEach((t) => {
      const task = this.taskManager.createTask({
        title: t.title,
        description: t.description,
        priority: t.priority,
        estimatedMinutes: t.estimatedMinutes,
        dueDate: t.dueDate,
        startDate: t.startDate,
        tags: t.tags,
        steps: t.steps.map((s) => s.title),
        repeatFrequency: t.repeatFrequency,
        repeatInterval: t.repeatInterval,
        repeatEndDate: t.repeatEndDate,
        parentTaskId: t.parentTaskId,
        goalId: t.goalId,
      });

      task.steps.forEach((step, index) => {
        if (t.steps[index]?.estimatedMinutes) {
          this.taskManager.updateStep(task.id, step.id, {
            estimatedMinutes: t.steps[index].estimatedMinutes,
          });
        }
      });

      createdTasks.push(task);
    });

    return createdTasks;
  }

  batchActions(actions: UserAction[], options?: {
    autoPlan?: boolean;
    planDate?: Date;
    planDays?: number;
    generateSummary?: boolean;
    summaryStartDate?: Date;
    summaryEndDate?: Date;
  }): BatchActionResult {
    const sortedActions = [...actions].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const results: BatchActionResult['results'] = [];
    let successCount = 0;
    let failCount = 0;

    sortedActions.forEach((action, index) => {
      try {
        const result = this.executeAction(action);
        results.push({
          actionIndex: index,
          actionType: action.type,
          success: result.success !== false,
          data: result.data,
        });
        if (result.success !== false) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (e: any) {
        results.push({
          actionIndex: index,
          actionType: action.type,
          success: false,
          error: e.message,
        });
        failCount++;
      }
    });

    const batchResult: BatchActionResult = {
      success: failCount === 0,
      results,
      totalSuccess: successCount,
      totalFailed: failCount,
    };

    if (options?.autoPlan) {
      const planDate = options.planDate || new Date();
      const planDays = options.planDays || 1;
      batchResult.finalPlan = this.plan({
        date: planDate,
        days: planDays,
      });
    }

    if (options?.generateSummary) {
      const startDate = options.summaryStartDate || startOfWeek(new Date());
      const endDate = options.summaryEndDate || endOfWeek(new Date());
      batchResult.summary = this.templateManager.generateExportSummary(
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

    return batchResult;
  }

  getTodayPlan(): DailyPlan {
    const planResult = this.plan({ date: new Date(), days: 1 });
    return planResult.dailyPlans[0];
  }

  getWeeklyPlan(startDate?: Date): DailyPlan[] {
    const start = startDate || new Date();
    const planResult = this.plan({ date: start, days: 7 });
    return planResult.dailyPlans;
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
