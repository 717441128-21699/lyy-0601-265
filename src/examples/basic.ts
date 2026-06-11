import { EfficiencySDK } from '../index';
import { Priority, UserAction } from '../types';

function runExample() {
  console.log('=== 个人效率 SDK - v3 增强版示例 ===\n');

  const sdk = new EfficiencySDK({
    workStartTime: '09:00',
    workEndTime: '18:00',
    workDays: [1, 2, 3, 4, 5],
    defaultEstimatedMinutes: 30,
    reminderLeadMinutes: 15,
  });

  const today = new Date();
  today.setHours(10, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  console.log('--- 1. 任务池排期：无时间的待办也能自动安排 ---');

  const poolTask1 = sdk.tasks.createTask({
    title: '整理文档',
    priority: 'medium',
    estimatedMinutes: 40,
    tags: ['文档'],
  });

  const poolTask2 = sdk.tasks.createTask({
    title: '代码 review',
    priority: 'high',
    estimatedMinutes: 60,
    tags: ['技术'],
  });

  const poolTask3 = sdk.tasks.createTask({
    title: '更新依赖版本',
    priority: 'low',
    estimatedMinutes: 30,
    tags: ['技术'],
  });

  console.log('创建 3 个无时间任务（任务池）:');
  [poolTask1, poolTask2, poolTask3].forEach((t) => {
    console.log(`  - ${t.title} | 优先级: ${t.priority} | 耗时: ${t.estimatedMinutes}分钟 | startDate: ${t.startDate || '无'} | dueDate: ${t.dueDate || '无'}`);
  });

  const planWithPool = sdk.plan({
    date: today,
    days: 3,
    schedulePool: true,
  });

  console.log('\n规划后（3天，含任务池排期）:');
  planWithPool.dailyPlans.forEach((dp, i) => {
    console.log(`  Day ${i + 1} (${dp.date.toLocaleDateString()}): ${dp.calendarBlocks.length} 个日历块, ${dp.totalScheduledMinutes}分钟已排程`);
    dp.calendarBlocks
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
      .forEach((b) => {
        console.log(`    - ${b.title}: ${b.startTime.toLocaleTimeString()} ~ ${b.endTime.toLocaleTimeString()}`);
      });
  });

  const poolTaskAfter = sdk.tasks.getTask(poolTask1.id);
  console.log(`\n任务池任务 "${poolTaskAfter?.title}" 排期后:`);
  console.log(`  startDate: ${poolTaskAfter?.startDate?.toLocaleString() || '无'}`);
  console.log(`  dueDate: ${poolTaskAfter?.dueDate?.toLocaleString() || '无'}`);
  console.log(`  calendarBlockIds: ${poolTaskAfter?.calendarBlockIds?.length || 0} 个`);

  if (planWithPool.unscheduledTasks.length > 0) {
    console.log(`\n未排入日程的任务: ${planWithPool.unscheduledTasks.length} 个`);
    planWithPool.unscheduledTasks.forEach((t) => console.log(`  - ${t.title}`));
  } else {
    console.log('\n所有任务均已排入日程 ✓');
  }

  console.log('\n--- 2. 批量操作（含失败继续、任务变化摘要） ---');

  const sdk2 = new EfficiencySDK({ workStartTime: '09:00', workEndTime: '18:00' });

  const batchDate = new Date(today);
  batchDate.setHours(14, 0, 0, 0);

  const batchActions: UserAction[] = [
    {
      type: 'create_task',
      payload: {
        title: '写技术方案',
        priority: 'high' as Priority,
        estimatedMinutes: 90,
        dueDate: batchDate,
        tags: ['技术', '方案'],
        steps: ['分析需求', '写初稿', '评审修改'],
      },
      timestamp: new Date(today.getTime() - 1000 * 60 * 60 * 5),
    },
    {
      type: 'create_task',
      payload: {
        title: '团队站会',
        priority: 'medium' as Priority,
        estimatedMinutes: 30,
        dueDate: batchDate,
        tags: ['会议'],
      },
      timestamp: new Date(today.getTime() - 1000 * 60 * 60 * 4),
    },
    {
      type: 'complete_task',
      payload: { taskId: 'nonexistent_task_id' },
      timestamp: new Date(today.getTime() - 1000 * 60 * 60 * 3),
    },
    {
      type: 'check_in',
      payload: {
        completedTasks: [],
        completedMinutes: 120,
        mood: 'good',
        note: '上午效率不错',
      },
      timestamp: new Date(today.getTime() - 1000 * 60 * 60 * 2),
    },
    {
      type: 'invalid_action',
      payload: {},
      timestamp: new Date(today.getTime() - 1000 * 60),
    },
  ];

  console.log('5 个操作，其中 2 个会失败:');
  console.log('  #3 complete_task → 不存在的任务ID');
  console.log('  #5 invalid_action → 未知操作类型');

  const batchContinue = sdk2.batchActions(batchActions, {
    autoPlan: true,
    planDate: batchDate,
    planDays: 1,
    continueOnError: true,
  });

  console.log('\n批量操作结果（continueOnError: true）:');
  console.log(`  全部成功: ${batchContinue.success}`);
  console.log(`  成功: ${batchContinue.totalSuccess}, 失败: ${batchContinue.totalFailed}`);
  console.log(`  continueOnError: ${batchContinue.continueOnError}`);
  console.log('  各步骤详情:');
  batchContinue.results.forEach((r, i) => {
    const status = r.success ? '✓' : (r.skipped ? '⊘' : '✗');
    console.log(`    ${i + 1}. [${status}] ${r.actionType}${r.error ? ` → ${r.error}` : ''}${r.skipped ? ` → ${r.skipReason}` : ''}`);
  });

  console.log('\n  任务变化摘要:');
  const tc = batchContinue.taskChanges;
  console.log(`    创建: ${tc.created.length} 个`, tc.created.map((c) => c.title).join(', ') || '无');
  console.log(`    完成: ${tc.completed.length} 个`, tc.completed.map((c) => c.title).join(', ') || '无');
  console.log(`    延期: ${tc.deferred.length} 个`, tc.deferred.map((c) => c.title).join(', ') || '无');
  console.log(`    排期: ${tc.scheduled.length} 个`, tc.scheduled.map((c) => `${c.title}@${c.startTime.toLocaleTimeString()}`).join(', ') || '无');
  console.log(`    套用模板: ${tc.templateApplied.length} 次`, tc.templateApplied.map((t) => `模板${t.templateId}→${t.taskIds.length}任务`).join(', ') || '无');

  const sdk2b = new EfficiencySDK({ workStartTime: '09:00', workEndTime: '18:00' });

  const batchStop = sdk2b.batchActions(batchActions, {
    continueOnError: false,
  });

  console.log('\n批量操作结果（continueOnError: false）:');
  console.log(`  成功: ${batchStop.totalSuccess}, 失败: ${batchStop.totalFailed}`);
  batchStop.results.forEach((r, i) => {
    const status = r.success ? '✓' : (r.skipped ? '⊘' : '✗');
    console.log(`    ${i + 1}. [${status}] ${r.actionType}${r.error ? ` → ${r.error}` : ''}${r.skipped ? ` → ${r.skipReason}` : ''}`);
  });

  console.log('\n--- 3. 模板套用返回数据一致性 ---');

  const sdk3 = new EfficiencySDK({ workStartTime: '09:00', workEndTime: '18:00' });

  const tplDate = new Date(tomorrow);
  tplDate.setHours(9, 0, 0, 0);

  const tpl = sdk3.templates.createTemplate({
    name: '版本发布检查清单',
    category: '发布',
    tasks: [
      {
        title: '代码冻结检查',
        priority: 'high',
        status: 'pending',
        tags: ['发布', '代码'],
        estimatedMinutes: 45,
        steps: [
          { id: 'ts1', title: '检查未合并分支', completed: false, estimatedMinutes: 15 },
          { id: 'ts2', title: '确认代码审查完成', completed: false, estimatedMinutes: 20 },
          { id: 'ts3', title: '验证构建通过', completed: false, estimatedMinutes: 10 },
        ],
        repeatFrequency: 'none',
        startDate: tplDate,
        dueDate: new Date(tplDate.getTime() + 45 * 60 * 1000),
        parentTaskId: undefined,
        goalId: undefined,
      },
      {
        title: '部署前验收',
        priority: 'urgent',
        status: 'pending',
        tags: ['发布', '验收'],
        estimatedMinutes: 60,
        steps: [
          { id: 'ts4', title: '功能回归测试', completed: false, estimatedMinutes: 30 },
          { id: 'ts5', title: '性能基准测试', completed: false, estimatedMinutes: 20 },
          { id: 'ts6', title: '安全扫描', completed: false, estimatedMinutes: 10 },
        ],
        repeatFrequency: 'weekly',
        repeatInterval: 1,
        startDate: new Date(tplDate.getTime() + 60 * 60 * 1000),
        dueDate: new Date(tplDate.getTime() + 120 * 60 * 1000),
        parentTaskId: undefined,
        goalId: undefined,
      },
    ],
    tags: ['发布'],
  });

  console.log(`创建模板: ${tpl.name}`);

  const applyResult = sdk3.handleAction({
    type: 'apply_template',
    payload: {
      templateId: tpl.id,
      startDate: tplDate,
    },
    timestamp: new Date(),
  });

  console.log('\n套用模板后返回的任务 vs 实际保存的任务:');
  const returnedTasks = applyResult.data || [];
  returnedTasks.forEach((returned: any, i: number) => {
    const saved = sdk3.tasks.getTask(returned.id);
    console.log(`  任务 ${i + 1}: ${returned.title}`);
    console.log(`    返回数据 - 步骤数: ${returned.steps?.length}, 标签: [${returned.tags?.join(', ')}], 重复: ${returned.repeatFrequency}`);
    console.log(`    保存数据 - 步骤数: ${saved?.steps?.length}, 标签: [${saved?.tags?.join(', ')}], 重复: ${saved?.repeatFrequency}`);

    if (returned.steps && saved?.steps) {
      returned.steps.forEach((rs: any, si: number) => {
        const ss = saved.steps[si];
        const match = ss && rs.title === ss.title && rs.estimatedMinutes === ss.estimatedMinutes;
        console.log(`      步骤${si + 1}: "${rs.title}" (${rs.estimatedMinutes ?? '无'}分钟) → 保存: "${ss?.title}" (${ss?.estimatedMinutes ?? '无'}分钟) ${match ? '✓' : '✗ 不一致!'}`);
      });
    }

    console.log(`    返回 goalId: ${returned.goalId ?? '无'}, 保存 goalId: ${saved?.goalId ?? '无'} ${returned.goalId === saved?.goalId ? '✓' : '✗ 不一致!'}`);
    console.log(`    返回 repeatInterval: ${returned.repeatInterval ?? '无'}, 保存 repeatInterval: ${saved?.repeatInterval ?? '无'} ${returned.repeatInterval === saved?.repeatInterval ? '✓' : '✗ 不一致!'}`);
  });

  console.log('\n--- 4. 计划预览模式（dry-run） ---');

  const sdk4 = new EfficiencySDK({ workStartTime: '09:00', workEndTime: '18:00' });

  const previewDate = new Date(tomorrow);
  previewDate.setHours(9, 0, 0, 0);

  const previewActions: UserAction[] = [
    {
      type: 'create_task',
      payload: {
        title: '需求评审',
        priority: 'high' as Priority,
        estimatedMinutes: 60,
        dueDate: previewDate,
        tags: ['需求'],
      },
      timestamp: new Date(),
    },
    {
      type: 'create_task',
      payload: {
        title: '设计走查',
        priority: 'medium' as Priority,
        estimatedMinutes: 30,
        dueDate: previewDate,
        tags: ['设计'],
      },
      timestamp: new Date(),
    },
  ];

  console.log('预览前 SDK 任务数:', sdk4.tasks.getAllTasks().length);

  const preview = sdk4.preview({
    actions: previewActions,
    planDate: previewDate,
    planDays: 1,
  });

  console.log('\n预览结果:');
  console.log(`  committed: ${preview.committed}`);
  console.log(`  规划日历块: ${preview.plan.dailyPlans[0]?.calendarBlocks.length || 0} 个`);
  console.log(`  批量操作成功: ${preview.batchResult?.totalSuccess || 0}, 失败: ${preview.batchResult?.totalFailed || 0}`);

  if (preview.batchResult?.taskChanges) {
    const ptc = preview.batchResult.taskChanges;
    console.log(`  预览-任务变化: 创建 ${ptc.created.length} 个`, ptc.created.map((c) => c.title).join(', '));
  }

  preview.plan.dailyPlans[0]?.calendarBlocks
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    .forEach((b) => {
      console.log(`    - ${b.title}: ${b.startTime.toLocaleTimeString()} ~ ${b.endTime.toLocaleTimeString()}`);
    });

  console.log('\n预览后 SDK 任务数（应该=0，dry-run 不写入）:', sdk4.tasks.getAllTasks().length);

  console.log('\n确认提交（commitPreview）:');
  const committed = sdk4.commitPreview();
  console.log(`  提交成功: ${committed}`);
  console.log('  提交后 SDK 任务数:', sdk4.tasks.getAllTasks().length);
  sdk4.tasks.getAllTasks().forEach((t) => {
    console.log(`    - ${t.title} | 步骤: ${t.steps.length} | 标签: [${t.tags.join(', ')}]`);
  });

  console.log('\n--- 5. 预览后丢弃 ---');

  const sdk5 = new EfficiencySDK({ workStartTime: '09:00', workEndTime: '18:00' });

  const preview2 = sdk5.preview({
    actions: [
      {
        type: 'create_task',
        payload: { title: '应该被丢弃的任务', priority: 'low', estimatedMinutes: 15 },
        timestamp: new Date(),
      },
    ],
    planDate: new Date(),
    planDays: 1,
  });

  console.log('预览后任务数:', sdk5.tasks.getAllTasks().length);
  console.log('预览中会创建:', preview2.batchResult?.taskChanges.created.map((c) => c.title).join(', '));

  const discarded = sdk5.discardPreview();
  console.log(`丢弃成功: ${discarded}`);
  console.log('丢弃后任务数:', sdk5.tasks.getAllTasks().length);

  console.log('\n=== 示例运行完成 ===');
}

runExample();
