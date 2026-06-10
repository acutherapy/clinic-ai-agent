项目：clinic-ai-agent

当前阶段：MVP Phase 1 完成

已完成：

✅ Next.js
✅ GitHub
✅ Vercel
✅ Supabase
✅ Website Form → Database
✅ Google Calendar OAuth
✅ Google Calendar API
✅ calendar-test
✅ find-slots V2
✅ capacity-test
✅ watcher agent
✅ calendar-agent
✅ sms-agent

Agent Pipeline：

Website Form
↓
Supabase
↓
Watcher Agent
↓
Calendar Agent
↓
Find Slots
↓
SMS Agent

数据库表：

appointments

关键字段：

id
patient_name
phone
email
chief_complaint
status
agent_status
suggested_times
sms_sent_at
confirmed_time
notes

当前状态流：

new
↓
processing
↓
calendar_search
↓
awaiting_reply

已验证：

1. watcher 自动发现新预约
2. calendar-agent 自动生成 suggested_times
3. find-slots 使用 Google Calendar 真空档
4. sms-agent 自动生成短信内容
5. sms_sent_at 自动写回数据库
6. npm run build 成功
7. GitHub 已同步
8. Vercel 可部署

Google Calendar：

AcuTherapy Appointments

业务规则：

总容量：3

针灸位：2

按摩位：1

下一阶段：

Phase 2

1. RingCentral SMS Integration
2. OpenAI SMS Writer
3. Reply Parser
4. Auto Booking to Google Calendar
5. Reminder Agent

当前优先任务：

接入 RingCentral 真发短信
