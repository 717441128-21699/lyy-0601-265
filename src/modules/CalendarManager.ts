import { CalendarBlock, TimeConflict, Task } from '../types';
import { generateId, hasOverlap, getOverlapMinutes, isSameDay, addMinutes } from '../utils';

export class CalendarManager {
  private blocks: Map<string, CalendarBlock> = new Map();

  createBlock(params: {
    title: string;
    startTime: Date;
    endTime: Date;
    taskId?: string;
    isAllDay?: boolean;
    color?: string;
    location?: string;
    description?: string;
    recurrenceRule?: string;
  }): CalendarBlock {
    const block: CalendarBlock = {
      id: generateId(),
      title: params.title,
      startTime: params.startTime,
      endTime: params.endTime,
      taskId: params.taskId,
      isAllDay: params.isAllDay || false,
      color: params.color,
      location: params.location,
      description: params.description,
      recurrenceRule: params.recurrenceRule,
    };

    this.blocks.set(block.id, block);
    return block;
  }

  getBlock(id: string): CalendarBlock | undefined {
    return this.blocks.get(id);
  }

  getAllBlocks(): CalendarBlock[] {
    return Array.from(this.blocks.values());
  }

  updateBlock(id: string, updates: Partial<CalendarBlock>): CalendarBlock | undefined {
    const block = this.blocks.get(id);
    if (!block) return undefined;

    const updated = { ...block, ...updates };
    this.blocks.set(id, updated);
    return updated;
  }

  deleteBlock(id: string): boolean {
    return this.blocks.delete(id);
  }

  getBlocksForDate(date: Date): CalendarBlock[] {
    return this.getAllBlocks().filter((block) => isSameDay(block.startTime, date));
  }

  getBlocksForRange(startDate: Date, endDate: Date): CalendarBlock[] {
    return this.getAllBlocks().filter(
      (block) => block.startTime >= startDate && block.startTime <= endDate
    );
  }

  getBlocksByTaskId(taskId: string): CalendarBlock[] {
    return this.getAllBlocks().filter((block) => block.taskId === taskId);
  }

  detectConflicts(excludeBlockId?: string): TimeConflict[] {
    const conflicts: TimeConflict[] = [];
    const blocks = this.getAllBlocks().filter((b) => b.id !== excludeBlockId);

    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const block1 = blocks[i];
        const block2 = blocks[j];

        if (hasOverlap(block1.startTime, block1.endTime, block2.startTime, block2.endTime)) {
          const overlapMinutes = getOverlapMinutes(
            block1.startTime,
            block1.endTime,
            block2.startTime,
            block2.endTime
          );

          conflicts.push({
            type: 'calendar_overlap',
            block1,
            block2,
            overlapMinutes,
            suggestion: this.generateConflictSuggestion(block1, block2, overlapMinutes),
          });
        }
      }
    }

    return conflicts;
  }

  checkBlockConflict(block: CalendarBlock): TimeConflict[] {
    const conflicts: TimeConflict[] = [];
    const otherBlocks = this.getAllBlocks().filter((b) => b.id !== block.id);

    for (const other of otherBlocks) {
      if (hasOverlap(block.startTime, block.endTime, other.startTime, other.endTime)) {
        const overlapMinutes = getOverlapMinutes(
          block.startTime,
          block.endTime,
          other.startTime,
          other.endTime
        );

        conflicts.push({
          type: 'calendar_overlap',
          block1: block,
          block2: other,
          overlapMinutes,
          suggestion: this.generateConflictSuggestion(block, other, overlapMinutes),
        });
      }
    }

    return conflicts;
  }

  private generateConflictSuggestion(
    block1: CalendarBlock,
    block2: CalendarBlock,
    overlapMinutes: number
  ): string {
    const shorterBlock =
      block1.endTime.getTime() - block1.startTime.getTime() <=
      block2.endTime.getTime() - block2.startTime.getTime()
        ? block1
        : block2;

    if (overlapMinutes <= 15) {
      return `时间轻微冲突（${overlapMinutes}分钟），建议微调「${shorterBlock.title}」的开始时间`;
    } else if (overlapMinutes <= 60) {
      return `存在${overlapMinutes}分钟时间冲突，建议将「${shorterBlock.title}」延后安排`;
    } else {
      return `严重时间冲突（${overlapMinutes}分钟），建议重新规划「${shorterBlock.title}」的时间`;
    }
  }

  findAvailableSlot(
    date: Date,
    durationMinutes: number,
    workStart: string = '09:00',
    workEnd: string = '18:00'
  ): Date | null {
    const [startHour, startMin] = workStart.split(':').map(Number);
    const [endHour, endMin] = workEnd.split(':').map(Number);

    const workStartTime = new Date(date);
    workStartTime.setHours(startHour, startMin, 0, 0);

    const workEndTime = new Date(date);
    workEndTime.setHours(endHour, endMin, 0, 0);

    const dayBlocks = this.getBlocksForDate(date).sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime()
    );

    let currentTime = new Date(workStartTime);

    for (const block of dayBlocks) {
      if (currentTime < block.startTime) {
        const gapMinutes = getOverlapMinutes(
          currentTime,
          addMinutes(currentTime, durationMinutes),
          currentTime,
          block.startTime
        );
        if (getMinutesBetween(currentTime, block.startTime) >= durationMinutes) {
          return new Date(currentTime);
        }
      }
      if (block.endTime > currentTime) {
        currentTime = new Date(block.endTime);
      }
    }

    if (getMinutesBetween(currentTime, workEndTime) >= durationMinutes) {
      return new Date(currentTime);
    }

    return null;
  }

  scheduleTaskBlock(
    task: Task,
    preferredDate: Date,
    workStart?: string,
    workEnd?: string
  ): CalendarBlock | null {
    const availableSlot = this.findAvailableSlot(
      preferredDate,
      task.estimatedMinutes,
      workStart,
      workEnd
    );

    if (!availableSlot) return null;

    return this.createBlock({
      title: task.title,
      startTime: availableSlot,
      endTime: addMinutes(availableSlot, task.estimatedMinutes),
      taskId: task.id,
      description: task.description,
    });
  }

  getTotalScheduledMinutes(date: Date): number {
    return this.getBlocksForDate(date).reduce((total, block) => {
      return total + getMinutesBetween(block.startTime, block.endTime);
    }, 0);
  }

  getFreeTimeMinutes(date: Date, workStart: string = '09:00', workEnd: string = '18:00'): number {
    const [startHour, startMin] = workStart.split(':').map(Number);
    const [endHour, endMin] = workEnd.split(':').map(Number);

    const workStartTime = new Date(date);
    workStartTime.setHours(startHour, startMin, 0, 0);

    const workEndTime = new Date(date);
    workEndTime.setHours(endHour, endMin, 0, 0);

    const workMinutes = getMinutesBetween(workStartTime, workEndTime);
    const scheduledMinutes = this.getTotalScheduledMinutes(date);

    return Math.max(0, workMinutes - scheduledMinutes);
  }

  moveBlock(blockId: string, newStartTime: Date): CalendarBlock | undefined {
    const block = this.blocks.get(blockId);
    if (!block) return undefined;

    const duration = getMinutesBetween(block.startTime, block.endTime);
    const newEndTime = addMinutes(newStartTime, duration);

    return this.updateBlock(blockId, {
      startTime: newStartTime,
      endTime: newEndTime,
    });
  }

  resizeBlock(blockId: string, newDurationMinutes: number): CalendarBlock | undefined {
    const block = this.blocks.get(blockId);
    if (!block) return undefined;

    const newEndTime = addMinutes(block.startTime, newDurationMinutes);

    return this.updateBlock(blockId, {
      endTime: newEndTime,
    });
  }
}

function getMinutesBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60));
}
