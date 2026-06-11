import { Goal, GoalMilestone, GoalStatus, Task } from '../types';
import { generateId } from '../utils';

export class GoalManager {
  private goals: Map<string, Goal> = new Map();

  createGoal(params: {
    title: string;
    description?: string;
    startDate: Date;
    endDate: Date;
    milestones?: string[];
    tags?: string[];
  }): Goal {
    const now = new Date();
    const goal: Goal = {
      id: generateId(),
      title: params.title,
      description: params.description,
      status: 'active',
      startDate: params.startDate,
      endDate: params.endDate,
      progress: 0,
      milestones: (params.milestones || []).map((title, index) => {
        const milestoneDate = new Date(params.startDate);
        const totalDays = (params.endDate.getTime() - params.startDate.getTime()) / (1000 * 60 * 60 * 24);
        const offsetDays = (totalDays / ((params.milestones?.length || 1) + 1)) * (index + 1);
        milestoneDate.setDate(milestoneDate.getDate() + offsetDays);

        return {
          id: generateId(),
          title,
          targetDate: milestoneDate,
          completed: false,
        };
      }),
      taskIds: [],
      tags: params.tags || [],
      createdAt: now,
      updatedAt: now,
    };

    this.goals.set(goal.id, goal);
    return goal;
  }

  getGoal(id: string): Goal | undefined {
    return this.goals.get(id);
  }

  getAllGoals(): Goal[] {
    return Array.from(this.goals.values());
  }

  updateGoal(id: string, updates: Partial<Goal>): Goal | undefined {
    const goal = this.goals.get(id);
    if (!goal) return undefined;

    const updated: Goal = {
      ...goal,
      ...updates,
      updatedAt: new Date(),
    };

    this.goals.set(id, updated);
    return updated;
  }

  deleteGoal(id: string): boolean {
    return this.goals.delete(id);
  }

  setGoalStatus(id: string, status: GoalStatus): Goal | undefined {
    return this.updateGoal(id, { status });
  }

  addMilestone(goalId: string, title: string, targetDate: Date): GoalMilestone | undefined {
    const goal = this.goals.get(goalId);
    if (!goal) return undefined;

    const milestone: GoalMilestone = {
      id: generateId(),
      title,
      targetDate,
      completed: false,
    };

    const updatedMilestones = [...goal.milestones, milestone].sort(
      (a, b) => a.targetDate.getTime() - b.targetDate.getTime()
    );

    this.updateGoal(goalId, { milestones: updatedMilestones });
    return milestone;
  }

  updateMilestone(
    goalId: string,
    milestoneId: string,
    updates: Partial<GoalMilestone>
  ): GoalMilestone | undefined {
    const goal = this.goals.get(goalId);
    if (!goal) return undefined;

    const milestoneIndex = goal.milestones.findIndex((m) => m.id === milestoneId);
    if (milestoneIndex === -1) return undefined;

    const updatedMilestone = { ...goal.milestones[milestoneIndex], ...updates };
    const updatedMilestones = [...goal.milestones];
    updatedMilestones[milestoneIndex] = updatedMilestone;

    this.updateGoal(goalId, { milestones: updatedMilestones });
    this.recalculateProgress(goalId);

    return updatedMilestone;
  }

  completeMilestone(goalId: string, milestoneId: string): GoalMilestone | undefined {
    return this.updateMilestone(goalId, milestoneId, {
      completed: true,
      completedAt: new Date(),
    });
  }

  removeMilestone(goalId: string, milestoneId: string): boolean {
    const goal = this.goals.get(goalId);
    if (!goal) return false;

    const updatedMilestones = goal.milestones.filter((m) => m.id !== milestoneId);
    this.updateGoal(goalId, { milestones: updatedMilestones });
    this.recalculateProgress(goalId);

    return true;
  }

  addTaskToGoal(goalId: string, taskId: string): Goal | undefined {
    const goal = this.goals.get(goalId);
    if (!goal) return undefined;

    if (goal.taskIds.includes(taskId)) return goal;

    const updated = this.updateGoal(goalId, {
      taskIds: [...goal.taskIds, taskId],
    });

    this.recalculateProgress(goalId);
    return updated;
  }

  removeTaskFromGoal(goalId: string, taskId: string): Goal | undefined {
    const goal = this.goals.get(goalId);
    if (!goal) return undefined;

    const updated = this.updateGoal(goalId, {
      taskIds: goal.taskIds.filter((id) => id !== taskId),
    });

    this.recalculateProgress(goalId);
    return updated;
  }

  recalculateProgress(goalId: string, tasks?: Task[]): number {
    const goal = this.goals.get(goalId);
    if (!goal) return 0;

    let progress = 0;

    if (goal.milestones.length > 0) {
      const completedMilestones = goal.milestones.filter((m) => m.completed).length;
      const milestoneProgress = (completedMilestones / goal.milestones.length) * 100;
      progress = milestoneProgress;
    }

    if (tasks && tasks.length > 0) {
      const goalTasks = tasks.filter((t) => goal.taskIds.includes(t.id));
      if (goalTasks.length > 0) {
        const completedTasks = goalTasks.filter((t) => t.status === 'completed').length;
        const taskProgress = (completedTasks / goalTasks.length) * 100;

        if (goal.milestones.length > 0) {
          progress = progress * 0.6 + taskProgress * 0.4;
        } else {
          progress = taskProgress;
        }
      }
    }

    const finalProgress = Math.round(Math.min(100, Math.max(0, progress)));
    this.updateGoal(goalId, { progress: finalProgress });

    if (finalProgress >= 100 && goal.status === 'active') {
      this.setGoalStatus(goalId, 'completed');
    }

    return finalProgress;
  }

  getGoalsByStatus(status: GoalStatus): Goal[] {
    return this.getAllGoals().filter((g) => g.status === status);
  }

  getGoalsByTag(tag: string): Goal[] {
    return this.getAllGoals().filter((g) => g.tags.includes(tag));
  }

  getActiveGoals(): Goal[] {
    return this.getGoalsByStatus('active');
  }

  addTag(goalId: string, tag: string): Goal | undefined {
    const goal = this.goals.get(goalId);
    if (!goal) return undefined;

    if (goal.tags.includes(tag)) return goal;

    return this.updateGoal(goalId, { tags: [...goal.tags, tag] });
  }

  removeTag(goalId: string, tag: string): Goal | undefined {
    const goal = this.goals.get(goalId);
    if (!goal) return undefined;

    return this.updateGoal(goalId, { tags: goal.tags.filter((t) => t !== tag) });
  }

  getGoalProgressDetail(goalId: string, tasks?: Task[]): {
    overall: number;
    milestones: { completed: number; total: number; progress: number };
    tasks: { completed: number; total: number; progress: number };
  } | undefined {
    const goal = this.goals.get(goalId);
    if (!goal) return undefined;

    const completedMilestones = goal.milestones.filter((m) => m.completed).length;
    const milestoneProgress = goal.milestones.length > 0
      ? Math.round((completedMilestones / goal.milestones.length) * 100)
      : 0;

    let completedTasks = 0;
    let taskProgress = 0;

    if (tasks && tasks.length > 0) {
      const goalTasks = tasks.filter((t) => goal.taskIds.includes(t.id));
      completedTasks = goalTasks.filter((t) => t.status === 'completed').length;
      taskProgress = goalTasks.length > 0
        ? Math.round((completedTasks / goalTasks.length) * 100)
        : 0;
    }

    const overall = goal.milestones.length > 0
      ? Math.round(milestoneProgress * 0.6 + taskProgress * 0.4)
      : taskProgress;

    return {
      overall: Math.min(100, overall),
      milestones: {
        completed: completedMilestones,
        total: goal.milestones.length,
        progress: milestoneProgress,
      },
      tasks: {
        completed: completedTasks,
        total: goal.taskIds.length,
        progress: taskProgress,
      },
    };
  }
}
