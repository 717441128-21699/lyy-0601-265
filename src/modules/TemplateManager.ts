import { TaskTemplate, Task, ExportSummary, Priority, TaskStep } from '../types';
import { generateId, startOfDay, endOfDay, formatDate, isSameWeek, addMinutes } from '../utils';

export class TemplateManager {
  private templates: Map<string, TaskTemplate> = new Map();

  createTemplate(params: {
    name: string;
    description?: string;
    category: string;
    tasks: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'calendarBlockIds' | 'deferRecords'>[];
    tags?: string[];
  }): TaskTemplate {
    const template: TaskTemplate = {
      id: generateId(),
      name: params.name,
      description: params.description,
      category: params.category,
      tasks: params.tasks,
      tags: params.tags || [],
      createdAt: new Date(),
    };

    this.templates.set(template.id, template);
    return template;
  }

  getTemplate(id: string): TaskTemplate | undefined {
    return this.templates.get(id);
  }

  getAllTemplates(): TaskTemplate[] {
    return Array.from(this.templates.values());
  }

  updateTemplate(id: string, updates: Partial<TaskTemplate>): TaskTemplate | undefined {
    const template = this.templates.get(id);
    if (!template) return undefined;

    const updated = { ...template, ...updates };
    this.templates.set(id, updated);
    return updated;
  }

  deleteTemplate(id: string): boolean {
    return this.templates.delete(id);
  }

  getTemplatesByCategory(category: string): TaskTemplate[] {
    return this.getAllTemplates().filter((t) => t.category === category);
  }

  getTemplatesByTag(tag: string): TaskTemplate[] {
    return this.getAllTemplates().filter((t) => t.tags.includes(tag));
  }

  applyTemplate(
    templateId: string,
    startDate: Date,
    options?: {
      goalId?: string;
      parentTaskId?: string;
      tagOverrides?: string[];
      preserveRelativeTime?: boolean;
    }
  ): Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'calendarBlockIds' | 'deferRecords'>[] {
    const template = this.templates.get(templateId);
    if (!template || template.tasks.length === 0) return [];

    const preserveRelativeTime = options?.preserveRelativeTime !== false;

    let referenceDate: Date | null = null;
    if (preserveRelativeTime) {
      for (const task of template.tasks) {
        if (task.startDate) {
          referenceDate = new Date(task.startDate);
          break;
        }
        if (task.dueDate) {
          referenceDate = new Date(task.dueDate);
          break;
        }
      }
    }

    const offsetMinutes = referenceDate
      ? (startDate.getTime() - referenceDate.getTime()) / (1000 * 60)
      : 0;

    return template.tasks.map((taskTemplate) => {
      const newSteps: TaskStep[] = taskTemplate.steps.map((step) => ({
        id: generateId(),
        title: step.title,
        completed: false,
        estimatedMinutes: step.estimatedMinutes,
      }));

      const result: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'calendarBlockIds' | 'deferRecords'> = {
        title: taskTemplate.title,
        description: taskTemplate.description,
        priority: taskTemplate.priority,
        status: 'pending',
        tags: options?.tagOverrides && options.tagOverrides.length > 0
          ? options.tagOverrides
          : [...taskTemplate.tags],
        estimatedMinutes: taskTemplate.estimatedMinutes,
        steps: newSteps,
        repeatFrequency: taskTemplate.repeatFrequency,
        repeatInterval: taskTemplate.repeatInterval,
        repeatEndDate: taskTemplate.repeatEndDate ? new Date(taskTemplate.repeatEndDate) : undefined,
        parentTaskId: options?.parentTaskId ?? taskTemplate.parentTaskId,
        goalId: options?.goalId ?? taskTemplate.goalId,
        actualMinutes: undefined,
        completedAt: undefined,
      };

      if (preserveRelativeTime && referenceDate) {
        if (taskTemplate.startDate) {
          const originalOffset = (taskTemplate.startDate.getTime() - referenceDate.getTime()) / (1000 * 60);
          result.startDate = addMinutes(startDate, originalOffset);
        }
        if (taskTemplate.dueDate) {
          const originalOffset = (taskTemplate.dueDate.getTime() - referenceDate.getTime()) / (1000 * 60);
          result.dueDate = addMinutes(startDate, originalOffset);
        }
      } else {
        result.dueDate = new Date(startDate);
      }

      return result;
    });
  }

  createTemplateFromTasks(
    name: string,
    tasks: Task[],
    category: string,
    description?: string
  ): TaskTemplate {
    const templateTasks = tasks.map((task) => {
      const { id, createdAt, updatedAt, calendarBlockIds, deferRecords, ...rest } = task;

      const steps: TaskStep[] = task.steps.map((step) => ({
        id: step.id,
        title: step.title,
        completed: false,
        estimatedMinutes: step.estimatedMinutes,
      }));

      return {
        ...rest,
        steps,
        status: 'pending' as const,
        completedAt: undefined,
        actualMinutes: undefined,
      };
    });

    const allTags = [...new Set(tasks.flatMap((t) => t.tags))];

    return this.createTemplate({
      name,
      description,
      category,
      tasks: templateTasks,
      tags: allTags,
    });
  }

  generateExportSummary(
    startDate: Date,
    endDate: Date,
    tasks: Task[],
    goals?: { id: string; title: string; progress: number; status: string }[]
  ): ExportSummary {
    const periodTasks = tasks.filter((t) => {
      if (t.createdAt >= startDate && t.createdAt <= endDate) return true;
      if (t.completedAt && t.completedAt >= startDate && t.completedAt <= endDate) return true;
      if (t.dueDate && t.dueDate >= startDate && t.dueDate <= endDate) return true;
      return false;
    });

    const total = periodTasks.length;
    const completed = periodTasks.filter((t) => t.status === 'completed').length;
    const deferred = periodTasks.filter((t) => t.deferRecords.length > 0).length;

    const byPriority: Record<Priority, number> = {
      low: 0,
      medium: 0,
      high: 0,
      urgent: 0,
    };

    const byTag: Record<string, number> = {};

    periodTasks.forEach((task) => {
      byPriority[task.priority]++;
      task.tags.forEach((tag) => {
        byTag[tag] = (byTag[tag] || 0) + 1;
      });
    });

    const totalEstimatedMinutes = periodTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
    const totalActualMinutes = periodTasks
      .filter((t) => t.actualMinutes)
      .reduce((sum, t) => sum + (t.actualMinutes || 0), 0);

    const byDay: Record<string, number> = {};
    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = formatDate(current);
      const dayTasks = periodTasks.filter((t) => {
        if (t.dueDate && formatDate(t.dueDate) === dateStr) return true;
        if (t.completedAt && formatDate(t.completedAt) === dateStr) return true;
        return false;
      });
      byDay[dateStr] = dayTasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
      current.setDate(current.getDate() + 1);
    }

    let activeGoals = 0;
    let completedGoals = 0;
    let totalGoalProgress = 0;

    if (goals && goals.length > 0) {
      activeGoals = goals.filter((g) => g.status === 'active').length;
      completedGoals = goals.filter((g) => g.status === 'completed').length;
      totalGoalProgress = Math.round(
        goals.reduce((sum, g) => sum + g.progress, 0) / goals.length
      );
    }

    const highlights: string[] = [];

    if (completed > 0) {
      highlights.push(`完成了 ${completed} 项任务`);
    }

    const highPriorityCompleted = periodTasks.filter(
      (t) => (t.priority === 'high' || t.priority === 'urgent') && t.status === 'completed'
    ).length;
    if (highPriorityCompleted > 0) {
      highlights.push(`完成了 ${highPriorityCompleted} 项高优先级任务`);
    }

    if (goals && goals.length > 0) {
      const progressedGoals = goals.filter((g) => g.progress > 0);
      if (progressedGoals.length > 0) {
        highlights.push(`${progressedGoals.length} 个目标取得了进展`);
      }
    }

    return {
      period: {
        start: startDate,
        end: endDate,
      },
      taskSummary: {
        total,
        completed,
        deferred,
        byPriority,
        byTag,
      },
      timeSummary: {
        totalEstimatedMinutes,
        totalActualMinutes,
        byDay,
      },
      goalSummary: {
        active: activeGoals,
        completed: completedGoals,
        totalProgress: totalGoalProgress,
      },
      highlights,
    };
  }

  exportSummaryToText(summary: ExportSummary): string {
    const lines: string[] = [];

    lines.push('=== 效率报告摘要 ===');
    lines.push(`周期：${formatDate(summary.period.start)} 至 ${formatDate(summary.period.end)}`);
    lines.push('');

    lines.push('【任务概览】');
    lines.push(`总任务数：${summary.taskSummary.total}`);
    lines.push(`已完成：${summary.taskSummary.completed}`);
    lines.push(`已延期：${summary.taskSummary.deferred}`);
    lines.push(
      `完成率：${summary.taskSummary.total > 0
        ? Math.round((summary.taskSummary.completed / summary.taskSummary.total) * 100)
        : 0}%`
    );
    lines.push('');

    lines.push('【按优先级分布】');
    Object.entries(summary.taskSummary.byPriority).forEach(([priority, count]) => {
      lines.push(`  ${priority}: ${count}`);
    });
    lines.push('');

    if (Object.keys(summary.taskSummary.byTag).length > 0) {
      lines.push('【按标签分布】');
      Object.entries(summary.taskSummary.byTag).forEach(([tag, count]) => {
        lines.push(`  ${tag}: ${count}`);
      });
      lines.push('');
    }

    lines.push('【时间统计】');
    lines.push(`预估总耗时：${summary.timeSummary.totalEstimatedMinutes} 分钟`);
    if (summary.timeSummary.totalActualMinutes > 0) {
      lines.push(`实际总耗时：${summary.timeSummary.totalActualMinutes} 分钟`);
    }
    lines.push('');

    if (summary.goalSummary.active > 0 || summary.goalSummary.completed > 0) {
      lines.push('【目标概览】');
      lines.push(`进行中：${summary.goalSummary.active}`);
      lines.push(`已完成：${summary.goalSummary.completed}`);
      lines.push(`平均进度：${summary.goalSummary.totalProgress}%`);
      lines.push('');
    }

    if (summary.highlights.length > 0) {
      lines.push('【亮点】');
      summary.highlights.forEach((h, i) => {
        lines.push(`${i + 1}. ${h}`);
      });
    }

    return lines.join('\n');
  }

  getCategories(): string[] {
    return [...new Set(this.getAllTemplates().map((t) => t.category))];
  }
}
