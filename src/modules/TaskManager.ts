import {
  Task,
  TaskStep,
  Priority,
  TaskStatus,
  RepeatFrequency,
  DeferRecord,
} from '../types';
import { generateId, addDays, sortTasksByPriority, isSameDay } from '../utils';

export class TaskManager {
  private tasks: Map<string, Task> = new Map();

  createTask(params: {
    title: string;
    description?: string;
    priority?: Priority;
    estimatedMinutes?: number;
    dueDate?: Date;
    startDate?: Date;
    tags?: string[];
    steps?: string[];
    repeatFrequency?: RepeatFrequency;
    repeatInterval?: number;
    repeatEndDate?: Date;
    parentTaskId?: string;
    goalId?: string;
  }): Task {
    const now = new Date();
    const task: Task = {
      id: generateId(),
      title: params.title,
      description: params.description,
      priority: params.priority || 'medium',
      status: 'pending',
      tags: params.tags || [],
      estimatedMinutes: params.estimatedMinutes || 30,
      steps: (params.steps || []).map((title, index) => ({
        id: generateId(),
        title,
        completed: false,
        estimatedMinutes: undefined,
      })),
      dueDate: params.dueDate,
      startDate: params.startDate,
      createdAt: now,
      updatedAt: now,
      repeatFrequency: params.repeatFrequency || 'none',
      repeatInterval: params.repeatInterval,
      repeatEndDate: params.repeatEndDate,
      parentTaskId: params.parentTaskId,
      goalId: params.goalId,
      deferRecords: [],
      calendarBlockIds: [],
    };

    if (task.steps.length > 0 && params.estimatedMinutes === undefined) {
      task.estimatedMinutes = task.steps.length * 15;
    }

    this.tasks.set(task.id, task);
    return task;
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  updateTask(id: string, updates: Partial<Task>): Task | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    const updated: Task = {
      ...task,
      ...updates,
      updatedAt: new Date(),
    };

    this.tasks.set(id, updated);
    return updated;
  }

  deleteTask(id: string): boolean {
    return this.tasks.delete(id);
  }

  setTaskStatus(id: string, status: TaskStatus): Task | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    const now = new Date();
    const updated: Task = {
      ...task,
      status,
      updatedAt: now,
      completedAt: status === 'completed' ? now : task.completedAt,
    };

    if (status === 'completed') {
      updated.steps = updated.steps.map((s) => ({ ...s, completed: true, completedAt: now }));
      const totalEstimated = updated.steps.reduce(
        (sum, s) => sum + (s.estimatedMinutes || 0),
        0
      );
      if (totalEstimated > 0) {
        updated.actualMinutes = totalEstimated;
      }
    }

    this.tasks.set(id, updated);
    return updated;
  }

  setPriority(id: string, priority: Priority): Task | undefined {
    return this.updateTask(id, { priority });
  }

  addStep(taskId: string, stepTitle: string, estimatedMinutes?: number): TaskStep | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    const step: TaskStep = {
      id: generateId(),
      title: stepTitle,
      completed: false,
      estimatedMinutes,
    };

    const updatedSteps = [...task.steps, step];
    this.updateTask(taskId, { steps: updatedSteps });

    return step;
  }

  updateStep(taskId: string, stepId: string, updates: Partial<TaskStep>): TaskStep | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    const stepIndex = task.steps.findIndex((s) => s.id === stepId);
    if (stepIndex === -1) return undefined;

    const updatedStep = { ...task.steps[stepIndex], ...updates };
    const updatedSteps = [...task.steps];
    updatedSteps[stepIndex] = updatedStep;

    this.updateTask(taskId, { steps: updatedSteps });
    return updatedStep;
  }

  toggleStep(taskId: string, stepId: string): TaskStep | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    const step = task.steps.find((s) => s.id === stepId);
    if (!step) return undefined;

    const now = new Date();
    return this.updateStep(taskId, stepId, {
      completed: !step.completed,
      completedAt: !step.completed ? now : undefined,
    });
  }

  removeStep(taskId: string, stepId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    const updatedSteps = task.steps.filter((s) => s.id !== stepId);
    this.updateTask(taskId, { steps: updatedSteps });
    return true;
  }

  addTag(taskId: string, tag: string): Task | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    if (task.tags.includes(tag)) return task;

    return this.updateTask(taskId, { tags: [...task.tags, tag] });
  }

  removeTag(taskId: string, tag: string): Task | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    return this.updateTask(taskId, { tags: task.tags.filter((t) => t !== tag) });
  }

  deferTask(taskId: string, deferredTo: Date, reason?: string): Task | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    const deferRecord: DeferRecord = {
      id: generateId(),
      deferredFrom: task.dueDate || new Date(),
      deferredTo,
      reason,
      deferredAt: new Date(),
    };

    return this.updateTask(taskId, {
      dueDate: deferredTo,
      status: 'deferred',
      deferRecords: [...task.deferRecords, deferRecord],
    });
  }

  getTasksByTag(tag: string): Task[] {
    return this.getAllTasks().filter((t) => t.tags.includes(tag));
  }

  getTasksByPriority(priority: Priority): Task[] {
    return this.getAllTasks().filter((t) => t.priority === priority);
  }

  getTasksByStatus(status: TaskStatus): Task[] {
    return this.getAllTasks().filter((t) => t.status === status);
  }

  getTasksForDate(date: Date): Task[] {
    return this.getAllTasks().filter((t) => {
      if (t.dueDate && isSameDay(t.dueDate, date)) return true;
      if (t.startDate && isSameDay(t.startDate, date)) return true;
      return false;
    });
  }

  getSubtasks(parentTaskId: string): Task[] {
    return this.getAllTasks().filter((t) => t.parentTaskId === parentTaskId);
  }

  getSortedTasks(): Task[] {
    return sortTasksByPriority(this.getAllTasks());
  }

  generateRecurringTasks(taskId: string, endDate: Date): Task[] {
    const originalTask = this.tasks.get(taskId);
    if (!originalTask || originalTask.repeatFrequency === 'none') return [];

    const generatedTasks: Task[] = [];
    let currentDate = originalTask.dueDate
      ? new Date(originalTask.dueDate)
      : new Date();

    const interval = originalTask.repeatInterval || 1;

    while (currentDate <= endDate) {
      currentDate = this.getNextOccurrence(currentDate, originalTask.repeatFrequency, interval);

      if (currentDate > endDate) break;
      if (originalTask.repeatEndDate && currentDate > originalTask.repeatEndDate) break;

      const newTask = this.createTask({
        title: originalTask.title,
        description: originalTask.description,
        priority: originalTask.priority,
        estimatedMinutes: originalTask.estimatedMinutes,
        dueDate: new Date(currentDate),
        tags: [...originalTask.tags],
        goalId: originalTask.goalId,
      });

      generatedTasks.push(newTask);
    }

    return generatedTasks;
  }

  private getNextOccurrence(
    current: Date,
    frequency: RepeatFrequency,
    interval: number
  ): Date {
    const next = new Date(current);

    switch (frequency) {
      case 'daily':
        next.setDate(next.getDate() + interval);
        break;
      case 'weekly':
        next.setDate(next.getDate() + 7 * interval);
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + interval);
        break;
      case 'yearly':
        next.setFullYear(next.getFullYear() + interval);
        break;
      default:
        break;
    }

    return next;
  }

  getTaskProgress(taskId: string): number {
    const task = this.tasks.get(taskId);
    if (!task) return 0;

    if (task.status === 'completed') return 100;
    if (task.steps.length === 0) return task.status === 'in_progress' ? 50 : 0;

    const completedSteps = task.steps.filter((s) => s.completed).length;
    return Math.round((completedSteps / task.steps.length) * 100);
  }

  filterTasks(options: {
    status?: TaskStatus[];
    priority?: Priority[];
    tags?: string[];
    dueBefore?: Date;
    dueAfter?: Date;
    goalId?: string;
  }): Task[] {
    return this.getAllTasks().filter((task) => {
      if (options.status && !options.status.includes(task.status)) return false;
      if (options.priority && !options.priority.includes(task.priority)) return false;
      if (options.tags && !options.tags.some((t) => task.tags.includes(t))) return false;
      if (options.dueBefore && task.dueDate && task.dueDate > options.dueBefore) return false;
      if (options.dueAfter && task.dueDate && task.dueDate < options.dueAfter) return false;
      if (options.goalId && task.goalId !== options.goalId) return false;
      return true;
    });
  }
}
