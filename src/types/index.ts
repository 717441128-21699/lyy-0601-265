export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'deferred';

export type RepeatFrequency = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export type ReminderType = 'popup' | 'email' | 'sms' | 'push';

export type GoalStatus = 'active' | 'completed' | 'abandoned' | 'paused';

export interface TaskStep {
  id: string;
  title: string;
  completed: boolean;
  estimatedMinutes?: number;
  completedAt?: Date;
}

export interface DeferRecord {
  id: string;
  deferredFrom: Date;
  deferredTo: Date;
  reason?: string;
  deferredAt: Date;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  status: TaskStatus;
  tags: string[];
  estimatedMinutes: number;
  actualMinutes?: number;
  steps: TaskStep[];
  dueDate?: Date;
  startDate?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  repeatFrequency: RepeatFrequency;
  repeatInterval?: number;
  repeatEndDate?: Date;
  parentTaskId?: string;
  goalId?: string;
  deferRecords: DeferRecord[];
  calendarBlockIds: string[];
}

export interface CalendarBlock {
  id: string;
  taskId?: string;
  title: string;
  startTime: Date;
  endTime: Date;
  isAllDay?: boolean;
  color?: string;
  location?: string;
  description?: string;
  recurrenceRule?: string;
}

export interface Reminder {
  id: string;
  taskId?: string;
  calendarBlockId?: string;
  title: string;
  remindAt: Date;
  type: ReminderType;
  isSent: boolean;
  sentAt?: Date;
  message?: string;
}

export interface GoalMilestone {
  id: string;
  title: string;
  targetDate: Date;
  completed: boolean;
  completedAt?: Date;
}

export interface Goal {
  id: string;
  title: string;
  description?: string;
  status: GoalStatus;
  startDate: Date;
  endDate: Date;
  progress: number;
  milestones: GoalMilestone[];
  taskIds: string[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface DailyPlan {
  date: Date;
  tasks: Task[];
  calendarBlocks: CalendarBlock[];
  totalEstimatedMinutes: number;
  focusScore: number;
}

export interface CheckInRecord {
  id: string;
  date: Date;
  completedTasks: string[];
  completedMinutes: number;
  plannedMinutes: number;
  mood?: string;
  note?: string;
  createdAt: Date;
}

export interface EfficiencyScore {
  date: Date;
  score: number;
  completionRate: number;
  focusMinutes: number;
  taskCount: number;
  deferredCount: number;
  details: {
    taskCompletion: number;
    timeAccuracy: number;
    focusConsistency: number;
    goalProgress: number;
  };
}

export interface WeeklyReview {
  startDate: Date;
  endDate: Date;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  totalEstimatedMinutes: number;
  totalActualMinutes: number;
  efficiencyScore: number;
  topTasks: Task[];
  deferredTasks: Task[];
  goalProgress: { goalId: string; title: string; progress: number }[];
  insights: string[];
  suggestions: string[];
}

export interface TaskTemplate {
  id: string;
  name: string;
  description?: string;
  category: string;
  tasks: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'calendarBlockIds' | 'deferRecords'>[];
  tags: string[];
  createdAt: Date;
}

export interface ExportSummary {
  period: {
    start: Date;
    end: Date;
  };
  taskSummary: {
    total: number;
    completed: number;
    deferred: number;
    byPriority: Record<Priority, number>;
    byTag: Record<string, number>;
  };
  timeSummary: {
    totalEstimatedMinutes: number;
    totalActualMinutes: number;
    byDay: Record<string, number>;
  };
  goalSummary: {
    active: number;
    completed: number;
    totalProgress: number;
  };
  highlights: string[];
}

export interface UserAction {
  type: string;
  payload: Record<string, any>;
  timestamp: Date;
}

export interface PlanningResult {
  tasks: Task[];
  calendarBlocks: CalendarBlock[];
  reminders: Reminder[];
  dailyPlans: DailyPlan[];
  suggestions: string[];
  conflicts: TimeConflict[];
}

export interface TimeConflict {
  type: 'task_overlap' | 'calendar_overlap' | 'deadline_conflict';
  block1: CalendarBlock | Task;
  block2: CalendarBlock | Task;
  overlapMinutes: number;
  suggestion: string;
}

export interface SDKOptions {
  timezone?: string;
  workStartTime?: string;
  workEndTime?: string;
  workDays?: number[];
  defaultEstimatedMinutes?: number;
  reminderLeadMinutes?: number;
}
