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
  BatchActionStepResult,
  TaskChangeSummary,
  PreviewResult,
  SDKSnapshot,
} from '../types';

import { addDays, addMinutes, sortTasksByPriority, startOfWeek, endOfWeek, isWorkDay } from '../utils';

export class EfficiencySDK {
  private taskManager: TaskManager;
  private calendarManager: CalendarManager;
  private reminderManager: ReminderManager;
  private goalManager: GoalManager;
  private statisticsManager: StatisticsManager;
  private reviewManager: ReviewManager;
  private templateManager: TemplateManager;
  private options: SDKOptions;
  private pendingPreview: PreviewResult | null = null;
  private pendingPreviewParams: { actions?: UserAction[]; planDate?: Date; planDays?: number } | null = null;

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

  get tasks() { return this.taskManager; }
  get calendar() { return this.calendarManager; }
  get reminders() { return this.reminderManager; }
  get goals() { return this.goalManager; }
  get statistics() { return this.statisticsManager; }
  get reviews() { return this.reviewManager; }
  get templates() { return this.templateManager; }

  plan(params: {
    date: Date;
    tasks?: Task[];
    days?: number;
    autoSchedule?: boolean;
    generateReminders?: boolean;
    schedulePool?: boolean;
  }): PlanningResult {
    const {
      date,
      days = 1,
      autoSchedule = true,
      generateReminders = true,
      schedulePool = true,
    } = params;

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

    if (schedulePool) {
      this.scheduleTaskPool(allTasks, date, days);
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
        const b1 = c.block1 as any;
        const b2 = c.block2 as any;
        const t1 = b1.startTime || b1.dueDate;
        const t2 = b2.startTime || b2.dueDate;
        return (t1 && this.isSameDay(t1, planDate)) || (t2 && this.isSameDay(t2, planDate));
      });

      const dayPlan = this.statisticsManager.generateDailyPlan(
        planDate,
        this.taskManager.getAllTasks(),
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

    const scheduledTaskIds = new Set(allCalendarBlocks.map((b) => b.taskId).filter(Boolean));
    const unscheduledTasks = this.taskManager.getAllTasks().filter(
      (t) => t.status !== 'completed' && t.status !== 'cancelled' && !scheduledTaskIds.has(t.id)
    );

    if (unscheduledTasks.length > 0) {
      suggestions.push(`有 ${unscheduledTasks.length} 个任务未能排入日程，可增加规划天数或调整优先级。`);
    }

    return {
      tasks: sortTasksByPriority(this.taskManager.getAllTasks()),
      calendarBlocks: allCalendarBlocks,
      reminders: allReminders,
      dailyPlans,
      suggestions,
      conflicts: allConflicts,
      unscheduledTasks,
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
            task, planDate, this.options.workStartTime, this.options.workEndTime
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

  private scheduleTaskPool(tasks: Task[], startDate: Date, days: number): void {
    const workDays = this.options.workDays || [1, 2, 3, 4, 5];
    const poolTasks = tasks.filter(
      (t) =>
        t.status !== 'completed' &&
        t.status !== 'cancelled' &&
        !t.dueDate &&
        !t.startDate &&
        t.calendarBlockIds.length === 0
    );

    if (poolTasks.length === 0) return;

    const sortedPool = sortTasksByPriority(poolTasks);

    let dayOffset = 0;
    let currentDate = new Date(startDate);

    for (const task of sortedPool) {
      let scheduled = false;
      let attempts = 0;

      while (!scheduled && attempts < days + 30) {
        if (isWorkDay(currentDate, workDays)) {
          const block = this.calendarManager.scheduleTaskBlock(
            task, currentDate, this.options.workStartTime, this.options.workEndTime
          );
          if (block) {
            this.taskManager.updateTask(task.id, {
              calendarBlockIds: [...task.calendarBlockIds, block.id],
              dueDate: block.endTime,
              startDate: block.startTime,
            });
            scheduled = true;
          }
        }

        dayOffset++;
        currentDate = addDays(startDate, dayOffset);
        attempts++;
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

  private executeAction(action: UserAction, changeTracker?: TaskChangeSummary): any {
    const { type, payload } = action;

    switch (type) {
      case 'create_task': {
        const task = this.taskManager.createTask(payload as any);
        if (payload.autoSchedule && task.dueDate) {
          this.plan({ date: task.dueDate, days: 1 });
        }
        if (changeTracker) {
          changeTracker.created.push({ taskId: task.id, title: task.title });
        }
        return { success: true, data: task };
      }

      case 'complete_task': {
        const existingTask = this.taskManager.getTask(payload.taskId);
        if (!existingTask) {
          return { success: false, error: `任务 ${payload.taskId} 不存在` };
        }
        this.taskManager.setTaskStatus(payload.taskId, 'completed');
        this.updateGoalProgress();
        const task = this.taskManager.getTask(payload.taskId);
        if (changeTracker) {
          changeTracker.completed.push({ taskId: payload.taskId, title: task?.title || '' });
        }
        return { success: true, data: task };
      }

      case 'defer_task': {
        const existingTask = this.taskManager.getTask(payload.taskId);
        if (!existingTask) {
          return { success: false, error: `任务 ${payload.taskId} 不存在` };
        }
        const task = this.taskManager.deferTask(payload.taskId, payload.deferredTo, payload.reason);
        if (changeTracker && task) {
          changeTracker.deferred.push({
            taskId: payload.taskId,
            title: task.title,
            deferredTo: payload.deferredTo,
          });
        }
        return { success: true, data: task };
      }

      case 'schedule_task': {
        const block = this.calendarManager.scheduleTaskBlock(
          payload.task, payload.date,
          this.options.workStartTime, this.options.workEndTime
        );
        if (block) {
          const task = this.taskManager.getTask(payload.task.id);
          if (task) {
            this.taskManager.updateTask(payload.task.id, {
              calendarBlockIds: [...task.calendarBlockIds, block.id],
            });
          }
          this.reminderManager.generateCalendarReminder(block);
          if (changeTracker) {
            changeTracker.scheduled.push({
              taskId: payload.task.id,
              title: block.title,
              blockId: block.id,
              startTime: block.startTime,
            });
          }
        }
        return { success: true, data: block };
      }

      case 'check_in': {
        const completedTaskIds: string[] = payload.completedTasks || [];
        const completedTitles: string[] = [];
        completedTaskIds.forEach((taskId: string) => {
          const t = this.taskManager.getTask(taskId);
          if (t) {
            this.taskManager.setTaskStatus(taskId, 'completed');
            completedTitles.push(t.title);
          }
        });
        this.updateGoalProgress();
        const result = this.statisticsManager.checkIn({
          completedTasks: completedTaskIds,
          completedMinutes: payload.completedMinutes || 0,
          mood: payload.mood,
          note: payload.note,
        });
        if (changeTracker) {
          completedTaskIds.forEach((taskId: string, idx: number) => {
            changeTracker.completed.push({ taskId, title: completedTitles[idx] || '' });
          });
        }
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

        if (changeTracker) {
          const taskIds = createdTasks.map((t) => t.id);
          changeTracker.templateApplied.push({ templateId: payload.templateId, taskIds });
          createdTasks.forEach((t) => {
            changeTracker.created.push({ taskId: t.id, title: t.title });
          });
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
          payload.startDate, payload.endDate,
          this.taskManager.getAllTasks(),
          this.goalManager.getAllGoals().map((g) => ({
            id: g.id, title: g.title, progress: g.progress, status: g.status,
          }))
        );
        return { success: true, data: summary };
      }

      case 'get_plan': {
        const plan = this.plan({ date: payload.date || new Date(), days: payload.days || 1 });
        return { success: true, data: plan };
      }

      default:
        return { success: false, error: `Unknown action type: ${type}` };
    }
  }

  private applyTemplateToTasks(
    templateId: string,
    startDate: Date,
    options?: { goalId?: string; parentTaskId?: string; tagOverrides?: string[]; }
  ): Task[] {
    const templateTasks = this.templateManager.applyTemplate(templateId, startDate, options);

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

      const freshTask = this.taskManager.getTask(task.id);
      if (freshTask) {
        createdTasks.push(freshTask);
      }
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
    continueOnError?: boolean;
  }): BatchActionResult {
    const continueOnError = options?.continueOnError !== false;
    const sortedActions = [...actions].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const results: BatchActionStepResult[] = [];
    const taskChanges: TaskChangeSummary = {
      created: [],
      completed: [],
      deferred: [],
      scheduled: [],
      templateApplied: [],
    };
    let successCount = 0;
    let failCount = 0;
    let stopped = false;

    sortedActions.forEach((action, index) => {
      if (stopped) {
        results.push({
          actionIndex: index,
          actionType: action.type,
          success: false,
          skipped: true,
          skipReason: '前置操作失败，已停止后续处理',
        });
        failCount++;
        return;
      }

      try {
        const result = this.executeAction(action, taskChanges);
        const isOk = result.success !== false;
        results.push({
          actionIndex: index,
          actionType: action.type,
          success: isOk,
          data: result.data,
          error: isOk ? undefined : result.error,
        });
        if (isOk) {
          successCount++;
        } else {
          failCount++;
          if (!continueOnError) {
            stopped = true;
          }
        }
      } catch (e: any) {
        results.push({
          actionIndex: index,
          actionType: action.type,
          success: false,
          error: e.message,
        });
        failCount++;
        if (!continueOnError) {
          stopped = true;
        }
      }
    });

    const batchResult: BatchActionResult = {
      success: failCount === 0,
      continueOnError,
      results,
      taskChanges,
      totalSuccess: successCount,
      totalFailed: failCount,
    };

    if (options?.autoPlan) {
      const planDate = options.planDate || new Date();
      batchResult.finalPlan = this.plan({
        date: planDate,
        days: options.planDays || 1,
      });
    }

    if (options?.generateSummary) {
      const startDate = options.summaryStartDate || startOfWeek(new Date());
      const endDate = options.summaryEndDate || endOfWeek(new Date());
      batchResult.summary = this.templateManager.generateExportSummary(
        startDate, endDate,
        this.taskManager.getAllTasks(),
        this.goalManager.getAllGoals().map((g) => ({
          id: g.id, title: g.title, progress: g.progress, status: g.status,
        }))
      );
    }

    return batchResult;
  }

  preview(params: {
    actions?: UserAction[];
    planDate?: Date;
    planDays?: number;
  }): PreviewResult {
    const snapshot = this.takeSnapshot();

    let batchResult: BatchActionResult | undefined;
    if (params.actions && params.actions.length > 0) {
      batchResult = this.batchActions(params.actions, {
        autoPlan: true,
        planDate: params.planDate,
        planDays: params.planDays,
        continueOnError: true,
      });
    }

    const plan = this.plan({
      date: params.planDate || new Date(),
      days: params.planDays || 1,
    });

    const previewResult: PreviewResult = {
      plan,
      batchResult,
      committed: false,
      snapshot,
    };

    this.pendingPreview = previewResult;
    this.pendingPreviewParams = { actions: params.actions, planDate: params.planDate, planDays: params.planDays };
    this.restoreSnapshot(snapshot);

    return previewResult;
  }

  commitPreview(): boolean {
    if (!this.pendingPreview || !this.pendingPreviewParams) return false;

    const { actions, planDate, planDays } = this.pendingPreviewParams;
    this.pendingPreview = null;
    this.pendingPreviewParams = null;

    if (actions && actions.length > 0) {
      this.batchActions(actions, {
        autoPlan: true,
        planDate,
        planDays,
        continueOnError: true,
      });
    } else {
      this.plan({ date: planDate || new Date(), days: planDays || 1 });
    }

    return true;
  }

  discardPreview(): boolean {
    if (!this.pendingPreview) return false;
    this.pendingPreview = null;
    this.pendingPreviewParams = null;
    return true;
  }

  private takeSnapshot(): SDKSnapshot {
    return {
      tasks: this.taskManager.getAllTasks().map((t) => ({ ...t, steps: [...t.steps], tags: [...t.tags], deferRecords: [...t.deferRecords], calendarBlockIds: [...t.calendarBlockIds] })),
      calendarBlocks: this.calendarManager.getAllBlocks().map((b) => ({ ...b })),
      reminders: this.reminderManager.getAllReminders().map((r) => ({ ...r })),
      goals: this.goalManager.getAllGoals().map((g) => ({ ...g, milestones: [...g.milestones], taskIds: [...g.taskIds], tags: [...g.tags] })),
    };
  }

  private restoreSnapshot(snapshot: SDKSnapshot): void {
    (this.taskManager as any).tasks = new Map(snapshot.tasks.map((t) => [t.id, t]));
    (this.calendarManager as any).blocks = new Map(snapshot.calendarBlocks.map((b) => [b.id, b]));
    (this.reminderManager as any).reminders = new Map(snapshot.reminders.map((r) => [r.id, r]));
    (this.goalManager as any).goals = new Map(snapshot.goals.map((g) => [g.id, g]));
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
    if (!this.options.workStartTime || !this.options.workEndTime) return 480;
    const [startHour, startMin] = this.options.workStartTime.split(':').map(Number);
    const [endHour, endMin] = this.options.workEndTime.split(':').map(Number);
    return (endHour - startHour) * 60 + (endMin - startMin);
  }

  exportData(): {
    tasks: Task[]; calendarBlocks: CalendarBlock[]; reminders: Reminder[];
    goals: Goal[]; checkIns: CheckInRecord[]; templates: TaskTemplate[]; options: SDKOptions;
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
    tasks?: Task[]; calendarBlocks?: CalendarBlock[]; reminders?: Reminder[];
    goals?: Goal[]; checkIns?: CheckInRecord[]; templates?: TaskTemplate[]; options?: SDKOptions;
  }): void {
    if (data.options) {
      this.options = { ...this.options, ...data.options };
    }
  }

  getStats() {
    return this.statisticsManager.getTotalStats(this.taskManager.getAllTasks());
  }

  filterTasks(options: {
    status?: TaskStatus[]; priority?: Priority[]; tags?: string[];
    dueBefore?: Date; dueAfter?: Date; goalId?: string;
  }): Task[] {
    return this.taskManager.filterTasks(options);
  }

  getTasksByTag(tag: string): Task[] { return this.taskManager.getTasksByTag(tag); }
  getTasksByPriority(priority: Priority): Task[] { return this.taskManager.getTasksByPriority(priority); }
  getStreak(): number { return this.statisticsManager.getStreak(); }

  generateSummary(startDate: Date, endDate: Date): ExportSummary {
    return this.templateManager.generateExportSummary(
      startDate, endDate,
      this.taskManager.getAllTasks(),
      this.goalManager.getAllGoals().map((g) => ({
        id: g.id, title: g.title, progress: g.progress, status: g.status,
      }))
    );
  }
}

export default EfficiencySDK;
