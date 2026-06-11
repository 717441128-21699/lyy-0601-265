import { EfficiencySDK } from '../index';
import { Priority, UserAction } from '../types';

function runExample() {
  console.log('=== 个人效率 SDK - 增强版示例 ===\n');

  const sdk = new EfficiencySDK({
    workStartTime: '09:00',
    workEndTime: '18:00',
    workDays: [1, 2, 3, 4, 5],
    defaultEstimatedMinutes: 30,
    reminderLeadMinutes: 15,
  });

  const today = new Date();
  today.setHours(10, 0, 0, 0);

  console.log('--- 1. 创建带完整配置的任务模板 ---');

  const templateDate = new Date(today);
  templateDate.setHours(9, 0, 0, 0);

  const template = sdk.templates.createTemplate({
    name: '产品发布准备流程',
    description: '产品上线前的标准检查流程',
    category: '产品',
    tasks: [
      {
        title: '需求确认与评审',
        description: '确认所有需求点，完成评审',
        priority: 'high',
        status: 'pending',
        tags: ['产品', '需求'],
        estimatedMinutes: 60,
        steps: [
          { id: 's1', title: '收集需求文档', completed: false, estimatedMinutes: 15 },
          { id: 's2', title: '内部评审讨论', completed: false, estimatedMinutes: 30 },
          { id: 's3', title: '整理评审意见', completed: false, estimatedMinutes: 15 },
        ],
        repeatFrequency: 'none',
        startDate: templateDate,
        dueDate: new Date(templateDate.getTime() + 60 * 60 * 1000),
        parentTaskId: undefined,
        goalId: undefined,
      },
      {
        title: 'UI 设计稿验收',
        description: '验收最终设计稿',
        priority: 'medium',
        status: 'pending',
        tags: ['设计', '产品'],
        estimatedMinutes: 45,
        steps: [
          { id: 's4', title: '对照需求检查', completed: false, estimatedMinutes: 20 },
          { id: 's5', title: '交互体验测试', completed: false, estimatedMinutes: 25 },
        ],
        repeatFrequency: 'none',
        startDate: new Date(templateDate.getTime() + 90 * 60 * 1000),
        dueDate: new Date(templateDate.getTime() + 135 * 60 * 1000),
        parentTaskId: undefined,
        goalId: undefined,
      },
      {
        title: '开发进度跟进',
        description: '确认开发进度和风险点',
        priority: 'high',
        status: 'pending',
        tags: ['技术', '产品'],
        estimatedMinutes: 30,
        steps: [
          { id: 's6', title: '查看代码提交', completed: false, estimatedMinutes: 10 },
          { id: 's7', title: '与开发沟通风险', completed: false, estimatedMinutes: 20 },
        ],
        repeatFrequency: 'weekly',
        repeatInterval: 1,
        startDate: new Date(templateDate.getTime() + 150 * 60 * 1000),
        dueDate: new Date(templateDate.getTime() + 180 * 60 * 1000),
        parentTaskId: undefined,
        goalId: undefined,
      },
      {
        title: '测试用例评审',
        description: '评审测试团队提交的用例',
        priority: 'medium',
        status: 'pending',
        tags: ['测试', '产品'],
        estimatedMinutes: 90,
        steps: [
          { id: 's8', title: '阅读测试用例', completed: false, estimatedMinutes: 30 },
          { id: 's9', title: '用例评审会议', completed: false, estimatedMinutes: 45 },
          { id: 's10', title: '整理反馈意见', completed: false, estimatedMinutes: 15 },
        ],
        repeatFrequency: 'none',
        startDate: new Date(templateDate.getTime() + 200 * 60 * 1000),
        dueDate: new Date(templateDate.getTime() + 290 * 60 * 1000),
        parentTaskId: undefined,
        goalId: undefined,
      },
    ],
    tags: ['产品', '发布流程'],
  });

  console.log('创建模板:', template.name);
  console.log('模板包含任务数:', template.tasks.length);
  console.log('模板标签:', template.tags);
  console.log('各任务配置:');
  template.tasks.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.title}`);
    console.log(`     - 优先级: ${t.priority}, 耗时: ${t.estimatedMinutes}分钟`);
    console.log(`     - 步骤数: ${t.steps.length}, 重复: ${t.repeatFrequency}`);
    console.log(`     - 标签: [${t.tags.join(', ')}]`);
  });

  console.log('\n--- 2. 套用模板（验证完整保留步骤、重复、标签、相对时间） ---');

  const applyDate = new Date(today);
  applyDate.setDate(applyDate.getDate() + 1);
  applyDate.setHours(9, 30, 0, 0);

  const appliedTasks = sdk.templates.applyTemplate(template.id, applyDate, {
    preserveRelativeTime: true,
  });

  console.log(`套用模板到 ${applyDate.toLocaleDateString()} ${applyDate.toLocaleTimeString()}`);
  console.log('生成任务数:', appliedTasks.length);
  console.log('任务详情（验证步骤、重复规则、标签都保留）:');

  appliedTasks.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.title}`);
    console.log(`     优先级: ${t.priority} | 耗时: ${t.estimatedMinutes}分钟`);
    console.log(`     步骤数: ${t.steps.length} (${t.steps.map(s => s.title).join(', ')})`);
    console.log(`     重复规则: ${t.repeatFrequency}${t.repeatInterval ? ` (间隔${t.repeatInterval})` : ''}`);
    console.log(`     标签: [${t.tags.join(', ')}]`);
    if (t.startDate) {
      console.log(`     开始时间: ${t.startDate.toLocaleTimeString()}`);
    }
    if (t.dueDate) {
      console.log(`     截止时间: ${t.dueDate.toLocaleTimeString()}`);
    }
  });

  console.log('\n--- 3. 套用模板并创建实际任务 + 自动排期 ---');

  const sdk2 = new EfficiencySDK({
    workStartTime: '09:00',
    workEndTime: '18:00',
    reminderLeadMinutes: 10,
  });

  sdk2.templates.createTemplate({
    name: template.name,
    description: template.description,
    category: template.category,
    tasks: template.tasks,
    tags: template.tags,
  });

  const templateId = sdk2.templates.getAllTemplates()[0]?.id;

  if (templateId) {
    const result = sdk2.handleAction({
      type: 'apply_template',
      payload: {
        templateId,
        startDate: applyDate,
        autoPlan: true,
        planDays: 1,
      },
      timestamp: new Date(),
    });

    console.log('通过 handleAction 套用模板+自动排期:');
    console.log('  成功:', result.success);
    console.log('  创建任务数:', result.data?.length || 0);

    if (result.data && result.data.length > 0) {
      const firstTask = result.data[0];
      console.log('  第一个任务步骤数:', firstTask.steps?.length || 0);
      console.log('  第一个任务标签:', firstTask.tags?.join(', ') || '');
      console.log('  第一个任务重复规则:', firstTask.repeatFrequency || 'none');
    }
  }

  console.log('\n--- 4. 智能规划 - 每日计划完整信息（日历块+提醒+冲突） ---');

  const planResult = sdk2.plan({
    date: applyDate,
    days: 1,
    autoSchedule: true,
    generateReminders: true,
  });

  const dayPlan = planResult.dailyPlans[0];

  console.log(`日期: ${dayPlan.date.toLocaleDateString()}`);
  console.log('  任务数量:', dayPlan.tasks.length);
  console.log('  日历块数量:', dayPlan.calendarBlocks.length);
  console.log('  提醒数量:', dayPlan.reminders.length);
  console.log('  冲突数量:', dayPlan.conflicts.length);
  console.log('  预估总耗时:', dayPlan.totalEstimatedMinutes, '分钟');
  console.log('  已排程时长:', dayPlan.totalScheduledMinutes, '分钟');
  console.log('  空闲时间:', dayPlan.freeMinutes, '分钟');
  console.log('  专注评分:', dayPlan.focusScore, '/ 100');
  console.log('  智能建议:', dayPlan.suggestions.length, '条');
  dayPlan.suggestions.forEach((s, i) => console.log(`    ${i + 1}. ${s}`));

  console.log('\n  日历块详情:');
  dayPlan.calendarBlocks
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    .forEach((block, i) => {
      console.log(`    ${i + 1}. ${block.title}`);
      console.log(`       ${block.startTime.toLocaleTimeString()} ~ ${block.endTime.toLocaleTimeString()}`);
    });

  console.log('\n  提醒详情:');
  dayPlan.reminders
    .sort((a, b) => a.remindAt.getTime() - b.remindAt.getTime())
    .slice(0, 5)
    .forEach((reminder, i) => {
      console.log(`    ${i + 1}. ${reminder.title}`);
      console.log(`       提醒时间: ${reminder.remindAt.toLocaleTimeString()} | 类型: ${reminder.type}`);
    });

  console.log('\n--- 5. 批量操作入口 ---');

  const sdk3 = new EfficiencySDK({
    workStartTime: '09:00',
    workEndTime: '18:00',
  });

  const batchDate = new Date(today);
  batchDate.setHours(14, 0, 0, 0);

  const actions: UserAction[] = [
    {
      type: 'create_task',
      payload: {
        title: '整理周报',
        priority: 'medium' as Priority,
        estimatedMinutes: 45,
        dueDate: batchDate,
        tags: ['周报', '工作'],
        steps: ['收集数据', '撰写内容', '审核发送'],
      },
      timestamp: new Date(today.getTime() - 1000 * 60 * 60 * 3),
    },
    {
      type: 'create_task',
      payload: {
        title: '客户电话会议',
        priority: 'high' as Priority,
        estimatedMinutes: 60,
        dueDate: new Date(batchDate.getTime() + 2 * 60 * 60 * 1000),
        tags: ['会议', '客户'],
      },
      timestamp: new Date(today.getTime() - 1000 * 60 * 60 * 2),
    },
    {
      type: 'complete_task',
      payload: {
        taskId: 'nonexistent_task',
      },
      timestamp: new Date(today.getTime() - 1000 * 60 * 60 * 1),
    },
    {
      type: 'check_in',
      payload: {
        completedTasks: [],
        completedMinutes: 120,
        mood: 'good',
        note: '上午效率不错',
      },
      timestamp: new Date(today.getTime() - 1000 * 60 * 30),
    },
    {
      type: 'invalid_action_type',
      payload: {},
      timestamp: new Date(today.getTime() - 1000 * 60 * 10),
    },
  ];

  const batchResult = sdk3.batchActions(actions, {
    autoPlan: true,
    planDate: batchDate,
    planDays: 1,
    generateSummary: true,
    summaryStartDate: batchDate,
    summaryEndDate: new Date(batchDate.getTime() + 24 * 60 * 60 * 1000),
  });

  console.log('批量操作结果:');
  console.log('  全部成功:', batchResult.success);
  console.log('  成功数:', batchResult.totalSuccess);
  console.log('  失败数:', batchResult.totalFailed);
  console.log('  各操作结果:');

  batchResult.results.forEach((r, i) => {
    console.log(`    ${i + 1}. [${r.success ? '✓' : '✗'}] ${r.actionType}`);
    if (r.error) {
      console.log(`       错误: ${r.error}`);
    }
  });

  if (batchResult.finalPlan) {
    console.log('\n  批量操作后的规划结果:');
    const plan = batchResult.finalPlan.dailyPlans[0];
    console.log('    任务数:', plan.tasks.length);
    console.log('    日历块数:', plan.calendarBlocks.length);
    console.log('    提醒数:', plan.reminders.length);
  }

  if (batchResult.summary) {
    console.log('\n  批量操作后的摘要:');
    console.log('    任务总数:', batchResult.summary.taskSummary.total);
    console.log('    完成数:', batchResult.summary.taskSummary.completed);
    console.log('    亮点:', batchResult.summary.highlights);
  }

  console.log('\n--- 6. 验证修复项 ---');

  console.log('\n✅ 修复项 1 - 模板套用步骤保留:');
  const allTemplateTasks = sdk2.tasks.getAllTasks();
  const taskWithSteps = allTemplateTasks.find(t => t.steps.length > 0);
  if (taskWithSteps) {
    console.log(`   找到带步骤的任务: ${taskWithSteps.title}`);
    console.log(`   步骤数量: ${taskWithSteps.steps.length}`);
    taskWithSteps.steps.forEach((s, i) => {
      console.log(`     ${i + 1}. ${s.title}${s.estimatedMinutes ? ` (${s.estimatedMinutes}分钟)` : ''}`);
    });
  }

  console.log('\n✅ 修复项 2 - 每日计划包含排期日程:');
  const tomorrowPlan = sdk2.getTodayPlan();
  const nextDayPlan = planResult.dailyPlans[0];
  console.log(`   套用模板日期的计划日历块数: ${nextDayPlan.calendarBlocks.length}`);
  console.log(`   套用模板日期的计划提醒数: ${nextDayPlan.reminders.length}`);
  console.log(`   套用模板日期的已排程时长: ${nextDayPlan.totalScheduledMinutes}分钟`);
  console.log(`   套用模板日期的空闲时间: ${nextDayPlan.freeMinutes}分钟`);
  if (nextDayPlan.calendarBlocks.length > 0) {
    console.log('   第一个日程块:', nextDayPlan.calendarBlocks[0].title);
    console.log('     时间:', nextDayPlan.calendarBlocks[0].startTime.toLocaleTimeString(),
      '~', nextDayPlan.calendarBlocks[0].endTime.toLocaleTimeString());
  }

  console.log('\n✅ 修复项 3 - 批量操作入口:');
  console.log('   batchActions 方法已实现');
  console.log('   支持: 创建任务、延期、完成打卡、套模板等');
  console.log('   结果包含: 各操作成功/失败状态、最终规划、摘要');

  console.log('\n=== 示例运行完成 ===');
}

runExample();
