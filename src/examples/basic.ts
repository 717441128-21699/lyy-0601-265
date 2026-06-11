import { EfficiencySDK } from '../index';
import { Priority, TaskStatus } from '../types';

function runExample() {
  console.log('=== 个人效率 SDK 使用示例 ===\n');

  const sdk = new EfficiencySDK({
    workStartTime: '09:00',
    workEndTime: '18:00',
    workDays: [1, 2, 3, 4, 5],
    defaultEstimatedMinutes: 30,
    reminderLeadMinutes: 15,
  });

  console.log('--- 1. 创建任务 ---');

  const today = new Date();
  today.setHours(10, 0, 0, 0);

  const task1 = sdk.tasks.createTask({
    title: '完成项目提案',
    description: '撰写 Q3 项目提案文档',
    priority: 'high',
    estimatedMinutes: 120,
    dueDate: new Date(today.getTime() + 3 * 60 * 60 * 1000),
    tags: ['工作', '重要'],
    steps: ['收集资料', '撰写大纲', '填充内容', '审核修改'],
  });
  console.log('创建任务:', task1.title, '- 优先级:', task1.priority);

  const task2 = sdk.tasks.createTask({
    title: '团队周会',
    priority: 'medium',
    estimatedMinutes: 60,
    dueDate: new Date(today.getTime() + 5 * 60 * 60 * 1000),
    tags: ['会议', '团队'],
  });
  console.log('创建任务:', task2.title, '- 优先级:', task2.priority);

  const task3 = sdk.tasks.createTask({
    title: '代码审查',
    priority: 'urgent',
    estimatedMinutes: 45,
    dueDate: new Date(today.getTime() + 1 * 60 * 60 * 1000),
    tags: ['工作', '技术'],
  });
  console.log('创建任务:', task3.title, '- 优先级:', task3.priority);

  console.log('\n--- 2. 今日任务计划 ---');

  const todayPlan = sdk.getTodayPlan();
  console.log('今日任务数量:', todayPlan.tasks.length);
  console.log('今日预估总耗时:', todayPlan.totalEstimatedMinutes, '分钟');
  console.log('今日专注评分:', todayPlan.focusScore, '/ 100');
  console.log('今日任务列表:');
  todayPlan.tasks.forEach((t, i) => {
    console.log(`  ${i + 1}. [${t.priority}] ${t.title} (${t.estimatedMinutes}分钟)`);
  });

  console.log('\n--- 3. 智能规划（自动排期+提醒） ---');

  const planResult = sdk.plan({ date: today, days: 1 });
  console.log('规划建议:', planResult.suggestions);
  console.log('时间冲突:', planResult.conflicts.length, '个');
  console.log('生成日历块:', planResult.calendarBlocks.length, '个');
  console.log('生成提醒:', planResult.reminders.length, '个');

  if (planResult.calendarBlocks.length > 0) {
    console.log('第一个日历块:', planResult.calendarBlocks[0].title,
      '-', planResult.calendarBlocks[0].startTime.toLocaleTimeString(),
      '~', planResult.calendarBlocks[0].endTime.toLocaleTimeString());
  }

  console.log('\n--- 4. 时间冲突检测 ---');

  const conflicts = sdk.calendar.detectConflicts();
  console.log('检测到冲突数量:', conflicts.length);

  console.log('\n--- 5. 步骤管理 ---');

  console.log(`任务「${task1.title}」的步骤:`);
  task1.steps.forEach((step, i) => {
    console.log(`  ${i + 1}. [${step.completed ? '✓' : ' '}] ${step.title}`);
  });

  sdk.tasks.toggleStep(task1.id, task1.steps[0].id);
  sdk.tasks.toggleStep(task1.id, task1.steps[1].id);

  const progress = sdk.tasks.getTaskProgress(task1.id);
  console.log('完成 2 个步骤后进度:', progress + '%');

  console.log('\n--- 6. 标签筛选 ---');

  const workTasks = sdk.getTasksByTag('工作');
  console.log('标签为「工作」的任务数量:', workTasks.length);

  const urgentTasks = sdk.getTasksByPriority('urgent');
  console.log('紧急优先级任务数量:', urgentTasks.length);

  console.log('\n--- 7. 延期任务 ---');

  const deferredDate = new Date(today);
  deferredDate.setDate(deferredDate.getDate() + 1);
  sdk.tasks.deferTask(task2.id, deferredDate, '需要更多准备时间');

  const deferredTasks = sdk.tasks.getTasksByStatus('deferred' as TaskStatus);
  console.log('延期任务数量:', deferredTasks.length);
  if (deferredTasks.length > 0) {
    console.log('延期原因:', deferredTasks[0].deferRecords[0].reason);
  }

  console.log('\n--- 8. 目标管理 ---');

  const goal = sdk.goals.createGoal({
    title: 'Q3 产品发布目标',
    description: '完成新产品的开发和发布',
    startDate: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
    endDate: new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000),
    milestones: ['完成需求分析', '完成设计评审', '完成开发', '完成测试', '正式发布'],
    tags: ['产品', '季度目标'],
  });
  console.log('创建目标:', goal.title);
  console.log('目标里程碑数量:', goal.milestones.length);

  sdk.goals.addTaskToGoal(goal.id, task1.id);
  sdk.goals.addTaskToGoal(goal.id, task3.id);

  sdk.goals.completeMilestone(goal.id, goal.milestones[0].id);

  const allTasks = sdk.tasks.getAllTasks();
  const updatedGoal = sdk.goals.recalculateProgress(goal.id, allTasks);
  console.log('目标当前进度:', updatedGoal + '%');

  console.log('\n--- 9. 完成打卡 ---');

  sdk.tasks.setTaskStatus(task3.id, 'completed');
  const checkIn = sdk.checkIn({
    completedTasks: [task3.id],
    completedMinutes: 40,
    mood: 'good',
    note: '今天效率不错！',
  });
  console.log('打卡记录:', checkIn.date.toLocaleDateString());
  console.log('完成任务数:', checkIn.completedTasks.length);
  console.log('专注分钟数:', checkIn.completedMinutes);

  console.log('\n--- 10. 效率评分 ---');

  const score = sdk.getEfficiencyScore();
  console.log('今日效率评分:', score.score, '/ 100');
  console.log('  - 任务完成率:', score.details.taskCompletion + '%');
  console.log('  - 时间准确度:', score.details.timeAccuracy + '%');
  console.log('  - 专注一致性:', score.details.focusConsistency + '%');
  console.log('  - 目标进度:', score.details.goalProgress + '%');

  console.log('\n--- 11. 模板管理 ---');

  const template = sdk.templates.createTemplate({
    name: '每日晨间例行',
    description: '每天早上的固定流程',
    category: '日常',
    tasks: [
      {
        title: '查看邮件',
        description: '',
        priority: 'medium',
        status: 'pending',
        tags: ['日常'],
        estimatedMinutes: 15,
        steps: [],
        repeatFrequency: 'none',
      },
      {
        title: '规划今日任务',
        description: '',
        priority: 'high',
        status: 'pending',
        tags: ['规划', '日常'],
        estimatedMinutes: 20,
        steps: [],
        repeatFrequency: 'none',
      },
      {
        title: '阅读行业资讯',
        description: '',
        priority: 'low',
        status: 'pending',
        tags: ['学习', '日常'],
        estimatedMinutes: 30,
        steps: [],
        repeatFrequency: 'none',
      },
    ],
    tags: ['日常', '晨间'],
  });
  console.log('创建模板:', template.name);
  console.log('模板包含任务数:', template.tasks.length);

  console.log('\n--- 12. 周复盘 ---');

  const weeklyReview = sdk.getWeeklyReview();
  console.log('本周回顾:');
  console.log('  时间范围:', weeklyReview.startDate.toLocaleDateString(), '-', weeklyReview.endDate.toLocaleDateString());
  console.log('  总任务数:', weeklyReview.totalTasks);
  console.log('  已完成:', weeklyReview.completedTasks);
  console.log('  完成率:', weeklyReview.completionRate + '%');
  console.log('  效率评分:', weeklyReview.efficiencyScore + '%');
  console.log('  洞察:', weeklyReview.insights);
  console.log('  建议:', weeklyReview.suggestions);

  console.log('\n--- 13. 导出摘要 ---');

  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const summary = sdk.generateSummary(weekStart, weekEnd);
  console.log('本周摘要:');
  console.log('  任务总数:', summary.taskSummary.total);
  console.log('  完成数:', summary.taskSummary.completed);
  console.log('  延期数:', summary.taskSummary.deferred);
  console.log('  亮点:', summary.highlights);

  const textSummary = sdk.templates.exportSummaryToText(summary);
  console.log('\n文本格式摘要:');
  console.log(textSummary);

  console.log('\n--- 14. 统计数据 ---');

  const stats = sdk.getStats();
  console.log('总统计:');
  console.log('  总任务数:', stats.totalTasks);
  console.log('  完成率:', stats.completionRate + '%');
  console.log('  总预估时长:', stats.totalEstimatedMinutes, '分钟');

  const streak = sdk.getStreak();
  console.log('  连续打卡天数:', streak);

  console.log('\n=== 示例运行完成 ===');
}

runExample();
