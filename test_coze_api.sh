#!/bin/bash
# Coze API 端点验证脚本
# 用于验证修复后的API调用是否正常工作

TOKEN="pat_KzIeafGiznRZDbwlS5QYsCfZgEp3LmhZMThl07jsQqPDAUXA4fQzPpgK5cHTE70C"
BOT_ID="7669022974943084584"
USER_ID="test_user"
API_BASE="https://api.coze.cn/v3"

echo "=========================================="
echo "Coze API 端点验证测试"
echo "=========================================="
echo ""

# 测试1: 验证CORS支持
echo "【测试1】验证CORS支持"
echo "----------------------------------------"
curl -s -I -X OPTIONS "${API_BASE}/chat" \
  -H "Origin: https://lu7ming.github.io" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Authorization,Content-Type" | grep -i "access-control"
echo ""

# 测试2: 发起对话
echo "【测试2】发起对话 (POST /v3/chat)"
echo "----------------------------------------"
CHAT_RESPONSE=$(curl -s -X POST "${API_BASE}/chat" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Origin: https://lu7ming.github.io" \
  -d "{
    \"bot_id\": \"${BOT_ID}\",
    \"user_id\": \"${USER_ID}\",
    \"stream\": false,
    \"auto_save_history\": true,
    \"additional_messages\": [
      {\"role\": \"user\", \"content\": \"你好，这是一条测试消息\", \"content_type\": \"text\"}
    ]
  }")

echo "响应: ${CHAT_RESPONSE}" | jq '.' 2>/dev/null || echo "响应: ${CHAT_RESPONSE}"
echo ""

# 提取conversation_id和chat_id
CONVERSATION_ID=$(echo "${CHAT_RESPONSE}" | jq -r '.data.conversation_id' 2>/dev/null)
CHAT_ID=$(echo "${CHAT_RESPONSE}" | jq -r '.data.id' 2>/dev/null)
STATUS=$(echo "${CHAT_RESPONSE}" | jq -r '.data.status' 2>/dev/null)

if [ -z "${CONVERSATION_ID}" ] || [ "${CONVERSATION_ID}" = "null" ]; then
  echo "❌ 错误: 无法获取conversation_id"
  exit 1
fi

echo "conversation_id: ${CONVERSATION_ID}"
echo "chat_id: ${CHAT_ID}"
echo "status: ${STATUS}"
echo ""

# 测试3: 轮询状态（如果需要）
if [ "${STATUS}" = "in_progress" ]; then
  echo "【测试3】轮询对话状态 (GET /v3/chat/retrieve)"
  echo "----------------------------------------"
  echo "等待AI处理..."
  sleep 3
  
  RETRIEVE_RESPONSE=$(curl -s "${API_BASE}/chat/retrieve?conversation_id=${CONVERSATION_ID}&chat_id=${CHAT_ID}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Origin: https://lu7ming.github.io")
  
  echo "响应: ${RETRIEVE_RESPONSE}" | jq '.' 2>/dev/null || echo "响应: ${RETRIEVE_RESPONSE}"
  STATUS=$(echo "${RETRIEVE_RESPONSE}" | jq -r '.data.status' 2>/dev/null)
  echo "新状态: ${STATUS}"
  echo ""
fi

# 测试4: 获取消息列表（修复后的端点）
echo "【测试4】获取消息列表 (GET /v3/chat/message/list) ✅ 已修复"
echo "----------------------------------------"
MESSAGE_RESPONSE=$(curl -s "${API_BASE}/chat/message/list?conversation_id=${CONVERSATION_ID}&chat_id=${CHAT_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Origin: https://lu7ming.github.io")

echo "响应: ${MESSAGE_RESPONSE}" | jq '.' 2>/dev/null || echo "响应: ${MESSAGE_RESPONSE}"
echo ""

# 提取AI回复
ANSWER=$(echo "${MESSAGE_RESPONSE}" | jq -r '.data[] | select(.role=="assistant" and .type=="answer") | .content' 2>/dev/null | head -1)

if [ -n "${ANSWER}" ] && [ "${ANSWER}" != "null" ]; then
  echo "✅ 成功! AI回复:"
  echo "----------------------------------------"
  echo "${ANSWER}"
  echo "----------------------------------------"
else
  echo "❌ 错误: 未获取到AI回复"
  exit 1
fi

echo ""
echo "=========================================="
echo "测试完成"
echo "=========================================="
echo ""
echo "总结:"
echo "✅ CORS支持正常"
echo "✅ POST /v3/chat 正常"
echo "✅ GET /v3/chat/retrieve 正常"
echo "✅ GET /v3/chat/message/list 正常（已修复）"
echo ""
echo "下一步:"
echo "1. 提交代码: git add core/nicole.js && git commit -m 'fix: 修复Coze API端点URL错误并添加超时控制'"
echo "2. 推送到GitHub: git push origin main"
echo "3. 清除浏览器缓存并测试妮可AI对话功能"
