import { Reminder, ReminderType, Task, CalendarBlock } from '../types';
import { generateId, addMinutes } from '../utils';

export class ReminderManager {
  private reminders: Map<string, Reminder> = new Map();
  private defaultLeadMinutes: number = 15;

  setDefaultLeadMinutes(minutes: number): void {
    this.defaultLeadMinutes = minutes;
  }

  createReminder(params: {
    title: string;
    remindAt: Date;
    type?: ReminderType;
    taskId?: string;
    calendarBlockId?: string;
    message?: string;
  }): Reminder {
    const reminder: Reminder = {
      id: generateId(),
      title: params.title,
      remindAt: params.remindAt,
      type: params.type || 'popup',
      taskId: params.taskId,
      calendarBlockId: params.calendarBlockId,
      isSent: false,
      message: params.message,
    };

    this.reminders.set(reminder.id, reminder);
    return reminder;
  }

  getReminder(id: string): Reminder | undefined {
    return this.reminders.get(id);
  }

  getAllReminders(): Reminder[] {
    return Array.from(this.reminders.values());
  }

  updateReminder(id: string, updates: Partial<Reminder>): Reminder | undefined {
    const reminder = this.reminders.get(id);
    if (!reminder) return undefined;

    const updated = { ...reminder, ...updates };
    this.reminders.set(id, updated);
    return updated;
  }

  deleteReminder(id: string): boolean {
    return this.reminders.delete(id);
  }

  generateTaskReminder(task: Task, leadMinutes?: number): Reminder {
    const lead = leadMinutes ?? this.defaultLeadMinutes;
    const remindTime = task.dueDate
      ? addMinutes(new Date(task.dueDate), -lead)
      : addMinutes(new Date(), lead);

    return this.createReminder({
      title: `任务提醒：${task.title}`,
      remindAt: remindTime,
      type: 'popup',
      taskId: task.id,
      message: `「${task.title}」将在 ${lead} 分钟后到期，请及时处理。`,
    });
  }

  generateCalendarReminder(block: CalendarBlock, leadMinutes?: number): Reminder {
    const lead = leadMinutes ?? this.defaultLeadMinutes;
    const remindTime = addMinutes(new Date(block.startTime), -lead);

    return this.createReminder({
      title: `日程提醒：${block.title}`,
      remindAt: remindTime,
      type: 'popup',
      calendarBlockId: block.id,
      message: `「${block.title}」将在 ${lead} 分钟后开始${block.location ? `，地点：${block.location}` : ''}。`,
    });
  }

  generateRemindersForTask(task: Task, options?: {
    startReminder?: boolean;
    dueReminder?: boolean;
    stepReminders?: boolean;
    leadMinutes?: number;
  }): Reminder[] {
    const reminders: Reminder[] = [];
    const lead = options?.leadMinutes ?? this.defaultLeadMinutes;

    if (options?.startReminder !== false && task.startDate) {
      reminders.push(
        this.createReminder({
          title: `开始提醒：${task.title}`,
          remindAt: addMinutes(new Date(task.startDate), -lead),
          type: 'popup',
          taskId: task.id,
          message: `「${task.title}」即将开始，请准备好相关资源。`,
        })
      );
    }

    if (options?.dueReminder !== false && task.dueDate) {
      reminders.push(
        this.createReminder({
          title: `到期提醒：${task.title}`,
          remindAt: addMinutes(new Date(task.dueDate), -lead),
          type: 'popup',
          taskId: task.id,
          message: `「${task.title}」将在 ${lead} 分钟后到期，请及时完成。`,
        })
      );
    }

    if (options?.stepReminders && task.steps.length > 0) {
      task.steps.forEach((step, index) => {
        if (task.startDate) {
          const stepRemindTime = addMinutes(
            new Date(task.startDate),
            index * (task.estimatedMinutes / task.steps.length)
          );
          reminders.push(
            this.createReminder({
              title: `步骤提醒：${step.title}`,
              remindAt: stepRemindTime,
              type: 'popup',
              taskId: task.id,
              message: `「${task.title}」的第 ${index + 1} 步「${step.title}」该开始了。`,
            })
          );
        }
      });
    }

    return reminders;
  }

  getPendingReminders(before?: Date): Reminder[] {
    const now = before || new Date();
    return this.getAllReminders()
      .filter((r) => !r.isSent && r.remindAt <= now)
      .sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime());
  }

  getUpcomingReminders(after?: Date, limit?: number): Reminder[] {
    const now = after || new Date();
    let reminders = this.getAllReminders()
      .filter((r) => !r.isSent && r.remindAt > now)
      .sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime());

    if (limit) {
      reminders = reminders.slice(0, limit);
    }

    return reminders;
  }

  markAsSent(id: string): Reminder | undefined {
    return this.updateReminder(id, {
      isSent: true,
      sentAt: new Date(),
    });
  }

  getRemindersByTask(taskId: string): Reminder[] {
    return this.getAllReminders().filter((r) => r.taskId === taskId);
  }

  getRemindersByCalendarBlock(blockId: string): Reminder[] {
    return this.getAllReminders().filter((r) => r.calendarBlockId === blockId);
  }

  snoozeReminder(id: string, snoozeMinutes: number): Reminder | undefined {
    const reminder = this.reminders.get(id);
    if (!reminder) return undefined;

    const newRemindAt = addMinutes(new Date(), snoozeMinutes);

    return this.updateReminder(id, {
      remindAt: newRemindAt,
      isSent: false,
    });
  }

  getDeferredTaskReminders(tasks: Task[]): Reminder[] {
    const reminders: Reminder[] = [];

    tasks
      .filter((t) => t.deferRecords.length > 0 && t.status === 'deferred')
      .forEach((task) => {
        const lastDefer = task.deferRecords[task.deferRecords.length - 1];
        reminders.push(
          this.createReminder({
            title: `延期任务提醒：${task.title}`,
            remindAt: new Date(lastDefer.deferredTo),
            type: 'popup',
            taskId: task.id,
            message: `「${task.title}」已延期 ${task.deferRecords.length} 次，请尽快处理。`,
          })
        );
      });

    return reminders;
  }
}
