import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

// Types for Cloudflare bindings
type Bindings = {
  OPENAI_API_KEY: string
}

// Legacy function removed - using hasAssistantContentEnhanced instead

// Enhanced hasAssistantContent function for GPT-5 with message.content[*].text support
function hasAssistantContentEnhanced(result: any): boolean {
  // Check top-level text fields
  if (typeof result?.output_text === 'string' && result.output_text.trim()) return true
  if (typeof result?.text === 'string' && result.text.trim()) return true
  if (typeof result?.text?.content === 'string' && result.text.content.trim()) return true
  
  // Check output array for assistant messages
  if (Array.isArray(result?.output)) {
    const hasMessage = result.output.some((item: any) => {
      // Look for actual text content, not just tool calls
      if (item.type === 'message' && item.role === 'assistant') {
        // Enhanced: Check message.content[*].text format for GPT-5
        if (Array.isArray(item.content)) {
          return item.content.some((part: any) => 
            (part?.type === 'text' || part?.type === 'output_text') && typeof part?.text === 'string' && part.text.trim()
          )
        }
        // Fallback: Check direct content string
        return typeof item.content === 'string' && item.content.trim()
      }
      if (item.type === 'text_generation' && item.text?.trim()) return true
      if (item.type === 'assistant_message' && item.content?.trim()) return true
      
      // Also check reasoning with actual content (GPT-5 specific)
      if (item.type === 'reasoning') {
        return (typeof item?.text === 'string' && item.text.trim()) ||
               (typeof item?.content === 'string' && item.content.trim()) ||
               (Array.isArray(item?.summary) && item.summary.length > 0)
      }
      
      return false
    })
    
    if (hasMessage) return true
    
    // For GPT-5: If we only have web_search_call and reasoning, we might need to wait longer
    const hasOnlySearchAndReasoning = result.output.every((item: any) => 
      item.type === 'web_search_call' || item.type === 'reasoning'
    )
    
    if (hasOnlySearchAndReasoning) {
      // Check if all web searches are completed
      const webSearches = result.output.filter((item: any) => item.type === 'web_search_call')
      const completedSearches = webSearches.filter((item: any) => item.status === 'completed')
      
      console.log(`[CONTENT_CHECK_ENH] Web searches: ${webSearches.length}, completed: ${completedSearches.length}`)
      
      // Only return true if we have reasoning content AND all searches are done
      const hasReasoningContent = result.output.some((item: any) => 
        item.type === 'reasoning' && (
          (typeof item?.text === 'string' && item.text.trim()) ||
          (typeof item?.content === 'string' && item.content.trim()) ||
          (Array.isArray(item?.summary) && item.summary.length > 0)
        )
      )
      
      return hasReasoningContent && webSearches.length > 0 && completedSearches.length === webSearches.length
    }
  }
  
  // Check choices array (fallback for other response formats)
  if (Array.isArray(result?.choices) && result.choices[0]?.message?.content?.trim()) return true
  
  return false
}

// Enhanced extractMessage function with improved content extraction
function extractMessageEnhanced(responsesResult: any) {
  console.log(`[EXTRACT_ENH] Starting enhanced message extraction`)

  let text = ''
  let annotations: any[] = []

  // Check output array for message content and annotations with GPT-5 support
  if (Array.isArray(responsesResult?.output)) {
    // Find the last assistant message and prioritize visible text
    const assistantMessages = responsesResult.output.filter((item: any) => 
      item.type === 'message' && item.role === 'assistant'
    )
    
    if (assistantMessages.length > 0) {
      // Get the last assistant message
      const lastMessage = assistantMessages[assistantMessages.length - 1]
      
      console.log(`[EXTRACT_ENH] Processing assistant message content:`, {
        contentType: typeof lastMessage.content,
        isArray: Array.isArray(lastMessage.content),
        contentPreview: Array.isArray(lastMessage.content) 
          ? `Array[${lastMessage.content.length}]`
          : typeof lastMessage.content === 'string'
          ? lastMessage.content.substring(0, 100) + '...'
          : (lastMessage.content ? JSON.stringify(lastMessage.content).substring(0, 100) + '...' : 'null/undefined')
      })
      
      // Enhanced: Handle message.content[*].text format for GPT-5 with annotations
      if (Array.isArray(lastMessage.content)) {
        console.log(`[EXTRACT_ENH] Content is array with ${lastMessage.content.length} parts`)
        const textParts: string[] = []
        
        for (const part of lastMessage.content) {
          const isText = (part?.type === 'text' || part?.type === 'output_text')
          if (isText && typeof part?.text === 'string' && part.text.trim()) {
            textParts.push(part.text)
          }
          // Collect annotations from each part
          if (Array.isArray(part?.annotations)) {
            annotations.push(...part.annotations)
          }
          console.log(`[EXTRACT_ENH] Part check:`, { type: part?.type, hasText: !!part?.text, hasAnnotations: Array.isArray(part?.annotations) })
        }
        
        if (textParts.length > 0) {
          text = textParts.join('\n')
          console.log(`[EXTRACT_ENH] Found text from message.content parts: ${textParts.length} parts, annotations: ${annotations.length}`)
        } else {
          console.log(`[EXTRACT_ENH] No valid text parts found in content array`)
        }
      }
      
      // Fallback: Direct content string
      if (!text && typeof lastMessage.content === 'string') {
        text = lastMessage.content
        console.log(`[EXTRACT_ENH] Found text from direct message.content string: ${text.length} chars`)
      }
      
      // Extract annotations from the message
      if (Array.isArray(lastMessage.annotations)) {
        annotations = lastMessage.annotations
        console.log(`[EXTRACT_ENH] Found ${annotations.length} annotations`)
      }
    }
    
    // If no assistant message, check for text_generation entries
    if (!text) {
      const textGeneration = responsesResult.output.find((item: any) => 
        item.type === 'text_generation' && item.text
      )
      
      if (textGeneration) {
        text = textGeneration.text
        console.log(`[EXTRACT_ENH] Found text from text_generation entry`)
      }
    }
    
    // Check for GPT-5 reasoning content as backup
    if (!text) {
      const reasoning = responsesResult.output.find((item: any) => 
        item.type === 'reasoning' && (item.text || item.content)
      )
      
      if (reasoning) {
        text = reasoning.text || reasoning.content
        console.log(`[EXTRACT_ENH] Found text from reasoning entry (backup)`)
      }
    }
  }

  // Check for direct output_text property (fallback)
  if (!text && responsesResult.output_text) {
    text = responsesResult.output_text
    console.log(`[EXTRACT_ENH] Found text from direct output_text property`)
  }
  
  // Check choices array (Chat Completions compatibility)
  if (!text && Array.isArray(responsesResult?.choices) && responsesResult.choices[0]?.message?.content) {
    text = responsesResult.choices[0].message.content
    console.log(`[EXTRACT_ENH] Found text from choices array (Chat Completions format)`)
  }

  // Detect if web search was used based on output array
  const searchUsed = detectSearchUsed(responsesResult)
  
  console.log(`[EXTRACT_ENH] Final extracted text length: ${text?.length || 0}, searchUsed: ${searchUsed}, annotations: ${annotations.length}`)
  if (!text) {
    console.log(`[EXTRACT_ENH] WARNING: No text extracted from response. Raw response structure:`)
    console.log(`[EXTRACT_ENH] Response keys:`, Object.keys(responsesResult))
    if (responsesResult.output) {
      console.log(`[EXTRACT_ENH] Output array:`, JSON.stringify(responsesResult.output, null, 2))
    }
  }
  
  return { text: text || '', annotations, searchUsed }
}

// Enhanced polling with exponential backoff and partial result salvage
async function pollResponseEnhanced(openaiKey: string, firstResult: any, timeoutMs = 90000, intervalMs = 800) {
  let result = firstResult
  const id = result.id
  const deadline = Date.now() + timeoutMs
  let pollCount = 0
  let wait = intervalMs

  console.log(`[POLL_ENH] Starting polling for response ID: ${id}, initial status: ${result?.status}`)

  while (result?.status === 'in_progress' || result?.status === 'queued') {
    if (Date.now() > deadline) {
      console.log(`[POLL_ENH] Timeout reached after ${pollCount} polls`)
      break
    }
    
    pollCount++
    console.log(`[POLL_ENH] Poll attempt #${pollCount}, waiting ${wait}ms...`)
    await new Promise(r => setTimeout(r, wait))
    
    // 指数バックオフ（上限 ~5s）
    wait = Math.min(Math.floor(wait * 1.5), 5000)
    
    const r = await fetch(`https://api.openai.com/v1/responses/${id}`, {
      headers: { 
        'Authorization': `Bearer ${openaiKey}`,
        'OpenAI-Beta': 'responses=v1'
      }
    })
    
    if (!r.ok) {
      const t = await r.text()
      console.error(`[POLL_ENH] Polling failed on attempt #${pollCount}:`, t)
      throw new Error(`Polling failed: ${t}`)
    }
    
    result = await r.json()
    console.log(`[POLL_ENH] Poll #${pollCount} result - Status: ${result?.status}`)
  }

  // "失敗系"でも、可視コンテンツが既にあるなら返す（partial=trueで扱う）
  const haveContent = hasAssistantContentEnhanced(result)
  if (['failed','incomplete','expired','cancelled'].includes(result?.status)) {
    console.log(`[POLL_ENH] Status ${result?.status}, checking for salvageable content: ${haveContent}`)
    if (haveContent) {
      // 可視テキスト救出のため、そのまま返却（呼び出し側で partial フラグを立てる）
      ;(result as any).__partial = true
      console.log(`[POLL_ENH] Salvaging partial content from ${result?.status} status`)
      return result
    }
    throw new Error(`Responses status=${result.status}: ${JSON.stringify(result?.error||{}, null, 2)}`)
  }

  // completed だが可視出力が遅れて到着するケースへの余剰ポーリング
  if (result?.status === 'completed') {
    console.log(`[POLL_ENH] Status completed, checking for assistant content...`)
    
    let extraPollCount = 0
    const extraDeadline = Date.now() + 30000 // Extra 30 seconds for assistant content (GPT-5)
    
    while (!hasAssistantContentEnhanced(result) && Date.now() < extraDeadline && extraPollCount < 30) {
      extraPollCount++
      console.log(`[POLL_ENH] Extra poll #${extraPollCount} waiting for assistant content...`)
      await new Promise(r => setTimeout(r, 1000))
      
      const r = await fetch(`https://api.openai.com/v1/responses/${id}`, {
        headers: { 
        'Authorization': `Bearer ${openaiKey}`,
        'OpenAI-Beta': 'responses=v1'
      }
      })
      
      if (r.ok) {
        const newResult = await r.json()
        
        // Log changes in output array
        const oldOutputCount = result?.output?.length || 0
        const newOutputCount = newResult?.output?.length || 0
        
        if (newOutputCount !== oldOutputCount) {
          console.log(`[POLL_ENH] Output array size changed: ${oldOutputCount} -> ${newOutputCount}`)
        }
        
        result = newResult
        console.log(`[POLL_ENH] Extra poll result - has content: ${hasAssistantContentEnhanced(result)}`)
        
        // If we found new content, log what we found
        if (hasAssistantContentEnhanced(result)) {
          console.log(`[POLL_ENH] Found assistant content after ${extraPollCount} extra polls!`)
          break
        }
      }
    }
  }

  console.log(`[POLL_ENH] Final polling result:`, JSON.stringify(result, null, 2))
  return result
}

// Legacy pollResponse function removed - using pollResponseEnhanced instead

// Legacy extractMessage function removed - using extractMessageEnhanced instead

// Detect if web search was used
function detectSearchUsed(res: any) {
  if (!Array.isArray(res?.output)) {
    console.log(`[SEARCH_DETECT] No output array found`)
    return false
  }
  
  console.log(`[SEARCH_DETECT] Scanning ${res.output.length} output items for web search usage`)
  
  const searchFound = res.output.some((it: any, index: number) => {
    // Check various search-related types (official web_search)
    const isSearch = (it?.type === 'tool_call' && it?.tool === 'web_search') || 
                    it?.type === 'web_search_call' ||
                    it?.type === 'web_search'
    
    // Also check for annotations/citations which indicate search results
    const hasAnnotations = it?.type === 'message' &&
      Array.isArray(it?.content) &&
      it.content.some((c: any) =>
        (Array.isArray(c?.annotations) && c.annotations.length > 0) ||
        (Array.isArray(c?.citations) && c.citations.length > 0)
      )
    
    console.log(`[SEARCH_DETECT] Item ${index}: type="${it?.type}", tool="${it?.tool}", isSearch=${isSearch}, hasAnnotations=${hasAnnotations}`)
    
    return isSearch || hasAnnotations
  })
  
  console.log(`[SEARCH_DETECT] Web search detected: ${searchFound}`)
  return searchFound
}

// Old function removed - using the enhanced callOnceWithModel version below
// Note: extractMessageEnhanced function is available for enhanced text extraction

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS - TODO: 本番環境では特定のオリジンに制限する
// app.use('*', cors({ origin: ['https://your-production-domain.com'] }))
app.use('*', cors())

// Single model execution function with GPT-5 optimizations
async function callOnceWithModel(
  openaiKey: string, 
  model: string, 
  inputMessages: any[], 
  tools: any[] = [],
  previousResponseId: string | null = null
): Promise<{ result: any; partial: boolean; error?: string }> {
  console.log(`[CALL_MODEL] Attempting with model: ${model}`)
  
  // GPT-5 specific optimizations
  const responsesData: any = {
    model: model,
    input: inputMessages,
    tool_choice: 'auto'
  }
  
  // Add previous_response_id if provided for conversation continuity
  if (previousResponseId) {
    responsesData.previous_response_id = previousResponseId
  }
  
  // Model-specific optimizations with increased token limits to prevent premature truncation
  if (model === 'gpt-5') {
    // GPT-5 specific settings for Responses API
    responsesData.max_output_tokens = 12000  // Responses API uses max_output_tokens
    responsesData.reasoning = { effort: 'low' }  // Use low/medium/high (minimal is invalid)
  } else if (model === 'gpt-4o') {
    responsesData.max_output_tokens = 12000  // High capacity models
  } else if (model === 'gpt-4o-mini' || model === 'gpt-5-mini') {
    responsesData.max_output_tokens = 6000   // Mini models with good capacity
  } else if (model === 'gpt-4-turbo') {
    responsesData.max_output_tokens = 4000   // GPT-4 Turbo
  } else if (model === 'gpt-3.5-turbo') {
    responsesData.max_output_tokens = 3000   // GPT-3.5 Turbo
  } else {
    responsesData.max_output_tokens = 2000   // Default for other models
  }
  
  // Add tools if available
  if (tools.length > 0) {
    responsesData.tools = tools
  }
  
  console.log(`[CALL_MODEL] Request config for ${model}:`, {
    model: responsesData.model,
    max_output_tokens: responsesData.max_output_tokens,
    reasoning: responsesData.reasoning,
    tools_count: tools.length,
    has_previous_response: !!previousResponseId
  })
  
  try {
    // Call OpenAI Responses API
    const responsesResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'responses=v1'
      },
      body: JSON.stringify(responsesData)
    })
    
    if (!responsesResponse.ok) {
      const errorText = await responsesResponse.text()
      console.error(`[CALL_MODEL] ${model} API Error:`, errorText)
      return { result: null, partial: false, error: errorText }
    }
    
    const responsesResult0 = await responsesResponse.json()
    console.log(`[CALL_MODEL] ${model} initial result:`, responsesResult0.id, responsesResult0.status)
    
    // Use enhanced polling for better result extraction
    const responsesResult = await pollResponseEnhanced(openaiKey, responsesResult0)
    
    // Check for partial results
    const isPartial = !!(responsesResult as any).__partial
    
    console.log(`[CALL_MODEL] ${model} final status: ${responsesResult.status}, partial: ${isPartial}`)
    
    return { result: responsesResult, partial: isPartial }
    
  } catch (error) {
    console.error(`[CALL_MODEL] ${model} failed:`, error)
    return { result: null, partial: false, error: error.toString() }
  }
}

// Get file metadata from OpenAI Files API
async function getFileMeta(openaiKey: string, id: string) {
  const response = await fetch(`https://api.openai.com/v1/files/${id}`, {
    headers: { 'Authorization': `Bearer ${openaiKey}` }
  })
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return await response.json() // { id, filename, purpose, ... }
}

// Check if file is an Office document
function isOffice(filename: string) {
  return /\.(xlsx|xls|docx|doc|pptx|ppt)$/i.test(filename || '')
}

// Code Interpreter function using Assistants API for Office files
async function callWithCodeInterpreter(
  openaiKey: string,
  message: string,
  fileIds: string[],
  conversationHistory: any[] = []
): Promise<{ result: any; partial: boolean; modelUsed: string; modelsTried: string[]; error?: string }> {
  console.log(`[CODE_INTERPRETER] Starting Assistants API with ${fileIds.length} files`)
  
  try {
    // Step 1: Create Assistant with Code Interpreter
    const assistantResponse = await fetch('https://api.openai.com/v1/assistants', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({
        name: 'GPT-5 Code Interpreter',
        instructions: 'あなたは有能なAIアシスタントです。添付されたファイルを詳細に分析し、データの傾向、パターン、洞察を日本語で提供してください。ExcelやCSVファイルの場合は、データの要約、統計、可視化を行ってください。ユーザーとの過去の会話内容を考慮して、継続的で一貫した回答を提供してください。',
        model: 'gpt-4o', // Code Interpreter is available on gpt-4o
        tools: [{ type: 'code_interpreter' }]
      })
    })
    
    if (!assistantResponse.ok) {
      const error = await assistantResponse.text()
      console.error('[CODE_INTERPRETER] Assistant creation failed:', error)
      return {
        result: null,
        partial: false,
        modelUsed: 'gpt-4o',
        modelsTried: ['gpt-4o'],
        error: `Assistant creation failed: ${error}`
      }
    }
    
    const assistant = await assistantResponse.json()
    console.log('[CODE_INTERPRETER] Assistant created:', assistant.id)
    
    // Step 2: Create Thread
    const threadResponse = await fetch('https://api.openai.com/v1/threads', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({})
    })
    
    if (!threadResponse.ok) {
      const error = await threadResponse.text()
      console.error('[CODE_INTERPRETER] Thread creation failed:', error)
      return {
        result: null,
        partial: false,
        modelUsed: 'gpt-4o',
        modelsTried: ['gpt-4o'],
        error: `Thread creation failed: ${error}`
      }
    }
    
    const thread = await threadResponse.json()
    console.log('[CODE_INTERPRETER] Thread created:', thread.id)
    
    // Step 3: Add current message with file attachments and conversation context
    const attachments = fileIds.map(fileId => ({
      file_id: fileId,
      tools: [{ type: 'code_interpreter' }]
    }))
    
    // Build contextual message including conversation history summary
    let contextualMessage = message
    if (conversationHistory.length > 0) {
      console.log('[CODE_INTERPRETER] Including conversation context:', conversationHistory.length, 'messages')
      
      // Create a summary of recent conversation for context
      const recentMessages = conversationHistory.slice(-6) // Last 6 messages
      const conversationContext = recentMessages
        .map(msg => `${msg.role}: ${typeof msg.content === 'string' ? msg.content.substring(0, 200) : JSON.stringify(msg.content).substring(0, 200)}`)
        .join('\n')
      
      contextualMessage = `【過去の会話】\n${conversationContext}\n\n【現在の質問】\n${message}\n\n上記の会話の流れを踏まえて回答してください。`
    }
    
    const messageResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({
        role: 'user',
        content: contextualMessage,
        attachments: attachments
      })
    })
    
    if (!messageResponse.ok) {
      const error = await messageResponse.text()
      console.error('[CODE_INTERPRETER] Message creation failed:', error)
      return {
        result: null,
        partial: false,
        modelUsed: 'gpt-4o',
        modelsTried: ['gpt-4o'],
        error: `Message creation failed: ${error}`
      }
    }
    
    const messageObj = await messageResponse.json()
    console.log('[CODE_INTERPRETER] Message added:', messageObj.id)
    
    // Step 4: Run Assistant
    const runResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'assistants=v2'
      },
      body: JSON.stringify({
        assistant_id: assistant.id
      })
    })
    
    if (!runResponse.ok) {
      const error = await runResponse.text()
      console.error('[CODE_INTERPRETER] Run creation failed:', error)
      return {
        result: null,
        partial: false,
        modelUsed: 'gpt-4o',
        modelsTried: ['gpt-4o'],
        error: `Run creation failed: ${error}`
      }
    }
    
    const run = await runResponse.json()
    console.log('[CODE_INTERPRETER] Run started:', run.id)
    
    // Step 5: Poll for completion with extended timeout for Code Interpreter
    let runStatus = run.status
    let attempts = 0
    const maxAttempts = 300 // 600 seconds timeout (10 minutes) for Code Interpreter tasks
    
    while (['queued', 'in_progress', 'requires_action'].includes(runStatus) && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2 seconds
      attempts++
      
      const statusResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`, {
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      })
      
      if (statusResponse.ok) {
        const statusObj = await statusResponse.json()
        runStatus = statusObj.status
        console.log(`[CODE_INTERPRETER] Run status (${attempts}/${maxAttempts}): ${runStatus}`)
        
        // Handle requires_action status (tool calls)
        if (runStatus === 'requires_action') {
          console.log('[CODE_INTERPRETER] Run requires action, continuing to poll...')
        }
      } else {
        console.error('[CODE_INTERPRETER] Status check failed:', await statusResponse.text())
      }
    }
    
    if (!['completed', 'failed', 'cancelled', 'expired'].includes(runStatus)) {
      console.error('[CODE_INTERPRETER] Run timed out after polling:', runStatus)
      
      // Try to retrieve any partial results before failing completely
      if (runStatus === 'in_progress' || runStatus === 'queued') {
        console.log('[CODE_INTERPRETER] Attempting to retrieve partial results...')
        
        try {
          const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
            headers: {
              'Authorization': `Bearer ${openaiKey}`,
              'OpenAI-Beta': 'assistants=v2'
            }
          })
          
          if (messagesResponse.ok) {
            const messages = await messagesResponse.json()
            const assistantMessages = messages.data.filter((msg: any) => msg.role === 'assistant')
            
            if (assistantMessages.length > 0) {
              console.log('[CODE_INTERPRETER] Found partial assistant responses during timeout')
              
              const latestMessage = assistantMessages[0]
              let partialText = ''
              
              if (Array.isArray(latestMessage.content)) {
                for (const content of latestMessage.content) {
                  if (content.type === 'text') {
                    partialText += content.text.value
                  }
                }
              }
              
              if (partialText.trim()) {
                console.log('[CODE_INTERPRETER] Returning partial response due to timeout')
                return {
                  result: {
                    message: `[部分的な応答] ${partialText}\n\n注意: 処理がタイムアウトしましたが、上記の部分的な結果が取得できました。`
                  },
                  partial: true,
                  modelUsed: 'gpt-4o',
                  modelsTried: ['gpt-4o'],
                  error: `Partial response recovered from timeout (${runStatus})`
                }
              }
            }
          }
        } catch (partialError) {
          console.error('[CODE_INTERPRETER] Failed to retrieve partial results:', partialError)
        }
      }
      
      return {
        result: null,
        partial: false,
        modelUsed: 'gpt-4o',
        modelsTried: ['gpt-4o'],
        error: `Code Interpreter timed out after ${attempts} attempts (${Math.round(attempts * 2 / 60, 1)} minutes). Status: ${runStatus}. OpenAI APIが混雑している可能性があります。しばらく待ってから再試行してください。`
      }
    }
    
    if (runStatus !== 'completed') {
      console.error('[CODE_INTERPRETER] Run did not complete successfully:', runStatus)
      
      // Try to get error details from the run
      let errorDetails = `Status: ${runStatus}`
      try {
        const runDetailsResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/runs/${run.id}`, {
          headers: {
            'Authorization': `Bearer ${openaiKey}`,
            'OpenAI-Beta': 'assistants=v2'
          }
        })
        
        if (runDetailsResponse.ok) {
          const runDetails = await runDetailsResponse.json()
          if (runDetails.last_error) {
            errorDetails += `. Error: ${runDetails.last_error.message || 'Unknown error'}`
            console.error('[CODE_INTERPRETER] Run error details:', runDetails.last_error)
          }
        }
      } catch (detailError) {
        console.warn('[CODE_INTERPRETER] Could not retrieve error details:', detailError)
      }
      
      return {
        result: null,
        partial: false,
        modelUsed: 'gpt-4o',
        modelsTried: ['gpt-4o'],
        error: `Code Interpreter failed: ${errorDetails}. 会話履歴が長すぎるか、ファイルサイズが大きすぎる可能性があります。`
      }
    }
    
    // Step 6: Get Messages
    const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${thread.id}/messages`, {
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'OpenAI-Beta': 'assistants=v2'
      }
    })
    
    if (!messagesResponse.ok) {
      const error = await messagesResponse.text()
      console.error('[CODE_INTERPRETER] Messages retrieval failed:', error)
      return {
        result: null,
        partial: false,
        modelUsed: 'gpt-4o',
        modelsTried: ['gpt-4o'],
        error: `Messages retrieval failed: ${error}`
      }
    }
    
    const messages = await messagesResponse.json()
    console.log('[CODE_INTERPRETER] Retrieved messages:', messages.data.length)
    
    // Find the assistant's response
    const assistantMessages = messages.data.filter((msg: any) => msg.role === 'assistant')
    
    if (assistantMessages.length === 0) {
      console.error('[CODE_INTERPRETER] No assistant messages found in thread')
      console.log('[CODE_INTERPRETER] Available messages:', messages.data.map((m: any) => ({ role: m.role, id: m.id })))
      return {
        result: null,
        partial: false,
        modelUsed: 'gpt-4o',
        modelsTried: ['gpt-4o'],
        error: 'No assistant response found in thread'
      }
    }
    
    console.log('[CODE_INTERPRETER] Found', assistantMessages.length, 'assistant messages')
    
    // Get the latest assistant message (first in the sorted list)
    const latestMessage = assistantMessages[0]
    let responseText = ''
    const files: { id: string; type: 'image' | 'file'; filename?: string }[] = []
    
    // Extract text content and generated files from message
    if (Array.isArray(latestMessage.content)) {
      for (const content of latestMessage.content) {
        if (content.type === 'text') {
          responseText += content.text.value
        } else if (content.type === 'image_file') {
          files.push({ 
            id: content.image_file.file_id, 
            type: 'image'
          })
          console.log('[CODE_INTERPRETER] Found generated image:', content.image_file.file_id)
        } else if (content.type === 'file_path') {
          files.push({ 
            id: content.file_path.file_id, 
            type: 'file', 
            filename: content.file_path.filename 
          })
          console.log('[CODE_INTERPRETER] Found generated file:', content.file_path.filename)
        } else {
          console.log('[CODE_INTERPRETER] Found non-text content:', content.type)
        }
      }
    } else {
      console.warn('[CODE_INTERPRETER] Unexpected message content format:', typeof latestMessage.content)
    }
    
    console.log('[CODE_INTERPRETER] Extracted response text length:', responseText.length)
    
    if (!responseText.trim()) {
      console.error('[CODE_INTERPRETER] Empty response text extracted')
      return {
        result: null,
        partial: false,
        modelUsed: 'gpt-4o',
        modelsTried: ['gpt-4o'],
        error: 'Empty response from Code Interpreter'
      }
    }
    
    // Step 7: Cleanup (delete assistant and thread)
    try {
      await fetch(`https://api.openai.com/v1/assistants/${assistant.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'OpenAI-Beta': 'assistants=v2'
        }
      })
      console.log('[CODE_INTERPRETER] Assistant cleaned up')
    } catch (error) {
      console.warn('[CODE_INTERPRETER] Assistant cleanup failed:', error)
    }
    
    return {
      result: {
        message: responseText,
        files, // Generated files (images, CSVs, etc.)
        thread_id: thread.id,
        run_id: run.id
      },
      partial: false,
      modelUsed: 'gpt-4o',
      modelsTried: ['gpt-4o']
    }
    
  } catch (error) {
    console.error('[CODE_INTERPRETER] Unexpected error:', error)
    return {
      result: null,
      partial: false,
      modelUsed: 'gpt-4o',
      modelsTried: ['gpt-4o'],
      error: error.toString()
    }
  }
}

// GPT-5 only function: No fallback to other models
async function callWithGPT5Only(
  openaiKey: string,
  model: string,
  inputMessages: any[],
  tools: any[] = [],
  previousResponseId: string | null = null
): Promise<{ result: any; partial: boolean; modelUsed: string; modelsTried: string[]; error?: string }> {
  
  const modelsTried: string[] = []
  
  // Only use GPT-5, reject any other model request
  if (model !== 'gpt-5') {
    console.log(`[GPT5_ONLY] Rejecting non-GPT-5 model request: ${model}`)
    return {
      result: null,
      partial: false,
      modelUsed: model,
      modelsTried: [model],
      error: `Only GPT-5 model is allowed. Requested model '${model}' is not supported.`
    }
  }
  
  console.log(`[GPT5_ONLY] Using GPT-5 exclusively`)
  modelsTried.push('gpt-5')
  
  const { result, partial, error } = await callOnceWithModel(
    openaiKey, 
    'gpt-5', 
    inputMessages, 
    tools,
    previousResponseId
  )
  
  if (result && !error) {
    console.log(`[GPT5_ONLY] Success with GPT-5 (partial: ${partial})`)
    return {
      result: result,
      partial: partial,
      modelUsed: 'gpt-5',
      modelsTried
    }
  } else {
    console.log(`[GPT5_ONLY] GPT-5 failed: ${error}`)
    return {
      result: null,
      partial: false,
      modelUsed: 'gpt-5',
      modelsTried,
      error: `GPT-5 failed: ${error}`
    }
  }
}

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// Streaming chat endpoint for real-time responses
app.post('/api/chat/stream', async (c) => {
  try {
    const { message, model = 'gpt-5', useSearch = false, previousResponseId = null } = await c.req.json()
    const openaiKey = c.env.OPENAI_API_KEY
    
    if (!openaiKey) {
      return c.json({ error: 'OpenAI API key not configured' }, 400)
    }
    
    // Only accept GPT-5 for streaming as well
    if (model !== 'gpt-5') {
      return c.json({ 
        error: 'Only GPT-5 model is allowed for streaming', 
        details: `Requested model '${model}' is not supported.` 
      }, 400)
    }
    
    const tools = useSearch ? [{ type: 'web_search' }] : []
    const body: any = {
      model: 'gpt-5',
      input: [{ role: 'user', content: message }],
      stream: true,
      max_output_tokens: 12000,
      reasoning: { effort: 'low' }
    }
    
    if (previousResponseId) {
      body.previous_response_id = previousResponseId
    }
    
    if (tools.length > 0) {
      body.tools = tools
      body.tool_choice = 'auto'
    }
    
    console.log('[STREAMING] Starting GPT-5 stream with:', {
      model: body.model,
      hasTools: tools.length > 0,
      hasPreviousResponse: !!previousResponseId
    })
    
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'responses=v1'
      },
      body: JSON.stringify(body)
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('[STREAMING] OpenAI API Error:', errorText)
      return c.json({ error: 'Streaming request failed', details: errorText }, response.status)
    }
    
    // Return the streaming response directly
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*', // TODO: 本番では特定のオリジンに制限
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST'
      }
    })
    
  } catch (error) {
    console.error('[STREAMING] Endpoint error:', error)
    return c.json({ error: 'Internal server error', details: error.toString() }, 500)
  }
})

// Responses API chat endpoint
app.post('/api/chat', async (c) => {
  try {
    const { message, messages = [], useSearch = false, fileContent = null, fileIds = [], model = 'gpt-5', previousResponseId = null } = await c.req.json()
    const openaiKey = c.env.OPENAI_API_KEY

    if (!openaiKey) {
      return c.json({ error: 'OpenAI API key not configured' }, 400)
    }

    // Prepare tools for Responses API
    const tools = []
    
    // Add web search tool if enabled
    if (useSearch) {
      tools.push({
        type: 'web_search'
      })
    }

    // Note: analyze_file tool removed - requires tool output submit implementation
    // Files are now handled via input_file format directly in messages

    // Build input messages for Responses API
    // For text-only messages, use string content directly
    // For multimodal messages (with files), use array format
    
    const cleanMessages = messages.map(msg => ({
      role: msg.role,
      content: Array.isArray(msg.content) ? msg.content : String(msg.content ?? '')
    }))
    
    // Build user content - use array format only if we have files
    let userContent: any
    const hasFiles = (Array.isArray(fileIds) && fileIds.length > 0) || 
                     (fileContent && typeof fileContent === 'string' && fileContent.trim())
    
    // Separate Office files from other files
    let officeFileIds: string[] = []
    let nonOfficeFileIds: string[] = []
    
    if (Array.isArray(fileIds) && fileIds.length > 0) {
      console.log('[FILE_ROUTING] Analyzing uploaded files:', fileIds.length)
      
      try {
        const metas = await Promise.all(fileIds.map(id => getFileMeta(openaiKey, id)))
        
        for (const { id, filename } of metas) {
          if (isOffice(filename)) {
            officeFileIds.push(id)
            console.log('[FILE_ROUTING] Office file detected:', filename, '-> Code Interpreter')
          } else {
            nonOfficeFileIds.push(id)
            console.log('[FILE_ROUTING] Non-Office file detected:', filename, '-> Responses API')
          }
        }
      } catch (error) {
        console.error('[FILE_ROUTING] Failed to get file metadata:', error)
        // Fallback: treat all as non-Office files
        nonOfficeFileIds = [...fileIds]
      }
    }
    
    // If Office files are present, use Code Interpreter via Assistants API
    if (officeFileIds.length > 0) {
      console.log('[OFFICE_FILES] Processing', officeFileIds.length, 'Office files with Code Interpreter')
      
      const { 
        result: codeInterpreterResult, 
        partial, 
        modelUsed, 
        modelsTried, 
        error: codeInterpreterError 
      } = await callWithCodeInterpreter(openaiKey, message, officeFileIds, cleanMessages)
      
      if (!codeInterpreterResult) {
        console.error('[OFFICE_FILES] Code Interpreter failed:', codeInterpreterError)
        
        return c.json({ 
          error: 'Code Interpreter failed', 
          details: codeInterpreterError,
          message: `Code Interpreterでエラーが発生しました。`,
          suggestion: 'ファイルが破損していないか確認し、再度アップロードしてください。',
          diagnostic: {
            modelRequested: model,
            modelsTried,
            modelUsed,
            partial,
            fallbackUsed: false,
            apiUsed: 'assistants_code_interpreter'
          }
        }, 500)
      }
      
      console.log('[OFFICE_FILES] Code Interpreter success')
      
      // Generate a unique response ID for conversation continuity
      const responseId = `ci_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      return c.json({
        message: codeInterpreterResult.message,
        responseId: responseId, // Generate unique ID for Code Interpreter responses
        searchUsed: false,
        fileUsed: true,
        apiUsed: 'assistants_code_interpreter',
        attachmentsSeen: officeFileIds.length,
        receivedFileIds: officeFileIds.length,
        generatedFiles: codeInterpreterResult.files || [], // Include generated files
        diagnostic: {
          modelRequested: model,
          modelUsed,
          modelsTried,
          partial,
          fallbackUsed: model !== modelUsed,
          apiUsed: 'assistants_code_interpreter'
        }
      })
    }
    
    if (hasFiles) {
      // Multimodal content array format
      userContent = []
      
      // Add main message text
      userContent.push({ type: 'input_text', text: message })
      
      // Add attached text content (optional)
      if (fileContent && typeof fileContent === 'string' && fileContent.trim()) {
        userContent.push({ type: 'input_text', text: `\n---\n【添付テキスト】\n${fileContent}` })
      }
      
      // Add non-Office files (PDF, images) to the content array
      if (Array.isArray(nonOfficeFileIds)) {
        for (const fid of nonOfficeFileIds) {
          if (typeof fid === 'string') {
            userContent.push({ type: 'input_file', file_id: fid })
          }
        }
      }
    } else {
      // Simple text content
      userContent = message
    }

    const inputMessages = [
      { 
        role: 'system', 
        content: 'あなたは有能なAIアシスタントです。ユーザーがファイルを添付した場合はWeb検索よりも**添付ファイルの内容を最優先**で精読し、要約・該当ページ/スライド番号の明示・根拠の引用を行って日本語で回答してください。ExcelファイルやOffice文書の場合は、Code Interpreterを使用してデータを分析し、具体的な数値や内容を示してください。検索を行う場合は出典を明記してください。'
      },
      ...cleanMessages,
      { role: 'user', content: userContent }
    ]

    console.log('Calling Responses API with tools:', JSON.stringify(tools, null, 2))
    console.log('Full request data:')
    console.log('- requested model:', model)
    console.log('- input type:', typeof inputMessages)
    console.log('- input content:', inputMessages ? JSON.stringify(inputMessages).substring(0, 200) + '...' : 'null/undefined')
    console.log('- tools count:', tools.length)
    console.log('- GPT-5 only mode: true')
    console.log('- previousResponseId:', previousResponseId ? 'provided' : 'none')

    // Use GPT-5 only system (no fallback)
    const { 
      result: responsesResult, 
      partial, 
      modelUsed, 
      modelsTried, 
      error: gpt5Error 
    } = await callWithGPT5Only(openaiKey, model, inputMessages, tools, previousResponseId)

    if (!responsesResult) {
      console.error('GPT-5 failed:', gpt5Error)
      
      // Special handling for Office file errors
      const isOfficeFileError = gpt5Error && gpt5Error.includes('Expected file type to be a supported format: .pdf but got')
      
      let errorMessage = `GPT-5でエラーが発生しました。`
      let suggestion = ''
      
      if (isOfficeFileError) {
        errorMessage = 'Responses APIはExcelファイルを直接サポートしていません。'
        suggestion = 'ExcelファイルをCSV形式で保存し直してからアップロードしてください。またはPDF形式で保存してください。'
      }
      
      return c.json({ 
        error: 'GPT-5 failed', 
        details: gpt5Error,
        message: errorMessage,
        suggestion: suggestion,
        diagnostic: {
          modelRequested: model,
          modelsTried,
          modelUsed: null,
          partial: false,
          fallbackUsed: false
        }
      }, 500)
    }

    console.log('Final Responses API status:', responsesResult.status, '- Model used:', modelUsed)
    console.log('Final response object keys:', Object.keys(responsesResult))
    console.log('Diagnostic info:', { modelUsed, modelsTried, partial })
    
    // Check for direct output_text property (from 1_basics.py example)
    if (responsesResult.output_text) {
      console.log('Found output_text property:', typeof responsesResult.output_text, 
        typeof responsesResult.output_text === 'string' ? responsesResult.output_text.substring(0, 200) + '...' : responsesResult.output_text)
    } else {
      console.log('No output_text property found')
    }
    
    // Extract message using enhanced logic
    const { text, searchUsed } = extractMessageEnhanced(responsesResult)
    
    // Try direct output_text first (from 1_basics.py pattern)
    let responseMessage = text
    
    if (!responseMessage && responsesResult.output_text) {
      responseMessage = responsesResult.output_text
      console.log('Using direct output_text property')
    }
    
    if (!responseMessage) {
      responseMessage = searchUsed
        ? 'Web検索は実行されましたが、最終応答の取得に失敗しました。少し待ってからもう一度お試しください。'
        : '回答の生成に失敗しました。もう一度お試しください。'
    }

    // 添付をサーバが何件 input_file として組み立てたか
    const attachmentsSeen = Array.isArray(userContent)
      ? userContent.filter(x => x?.type === 'input_file').length
      : 0
    const totalFilesReceived = (officeFileIds?.length || 0) + (nonOfficeFileIds?.length || 0)
    
    console.log('[DEBUG] Total files received:', totalFilesReceived)
    console.log('[DEBUG] Office files (Code Interpreter):', officeFileIds?.length || 0)
    console.log('[DEBUG] Non-Office files (Responses API):', nonOfficeFileIds?.length || 0)
    console.log('[DEBUG] input_file parts:', attachmentsSeen)

    return c.json({
      message: responseMessage,
      responseId: responsesResult?.id || null,  // Add responseId for conversation continuity
      searchUsed,
      fileUsed: !!fileContent || totalFilesReceived > 0,
      apiUsed: 'responses',
      attachmentsSeen,                      // UIで表示
      receivedFileIds: totalFilesReceived,  // UI/ログで表示
      // 診断情報を追加
      diagnostic: {
        modelRequested: model,
        modelUsed,
        modelsTried,
        partial,
        fallbackUsed: false
      }
    })

  } catch (error) {
    console.error('Responses API endpoint error:', error)
    
    // Return error instead of falling back
    return c.json({ 
      error: 'Internal server error', 
      details: error.toString(),
      message: 'サーバーエラーが発生しました。Chat Completions APIフォールバックは無効化されています。'
    }, 500)
  }
})

// Chat Completions fallback function removed - Responses API only mode

// Web search is now handled by Responses API built-in web_search tool
// No custom implementation needed

// Supported file formats for GPT-5 Responses API
const SUPPORTED_FILE_FORMATS = {
  // Text files (can be read directly)
  text: ['.txt', '.md', '.json', '.csv', '.log'],
  // Files supported by Responses API directly
  responses_api: ['.pdf'],
  // Image files (supported by GPT-5)
  images: ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
  // Office files (require Code Interpreter tool)
  office: ['.xlsx', '.xls', '.docx', '.doc', '.pptx', '.ppt']
}

// Get all supported extensions
const ALL_SUPPORTED_EXTENSIONS = [
  ...SUPPORTED_FILE_FORMATS.text,
  ...SUPPORTED_FILE_FORMATS.responses_api,
  ...SUPPORTED_FILE_FORMATS.images,
  ...SUPPORTED_FILE_FORMATS.office
]

// File upload endpoint for OpenAI Files API
app.post('/api/upload', async (c) => {
  try {
    const openaiKey = c.env.OPENAI_API_KEY
    if (!openaiKey) {
      return c.json({ error: 'OpenAI API key not configured' }, 400)
    }

    const formData = await c.req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return c.json({ error: 'No file provided' }, 400)
    }
    
    // Check file extension
    const fileName = file.name.toLowerCase()
    const fileExtension = fileName.substring(fileName.lastIndexOf('.'))
    
    if (!ALL_SUPPORTED_EXTENSIONS.includes(fileExtension)) {
      console.log(`[UPLOAD] Unsupported file type: ${fileExtension}`)
      return c.json({ 
        error: 'Unsupported file format',
        details: `File type '${fileExtension}' is not supported. Supported formats: ${ALL_SUPPORTED_EXTENSIONS.join(', ')}`,
        supportedFormats: ALL_SUPPORTED_EXTENSIONS
      }, 400)
    }
    
    console.log(`[UPLOAD] Processing supported file: ${fileName} (${fileExtension})`)

    // Handle different file types
    let fileContent = null
    let shouldUploadToOpenAI = true
    let fileType = 'unknown'
    
    // Determine file type
    if (SUPPORTED_FILE_FORMATS.text.includes(fileExtension)) {
      fileType = 'text'
    } else if (SUPPORTED_FILE_FORMATS.responses_api.includes(fileExtension)) {
      fileType = 'pdf'
    } else if (SUPPORTED_FILE_FORMATS.images.includes(fileExtension)) {
      fileType = 'image'
    } else if (SUPPORTED_FILE_FORMATS.office.includes(fileExtension)) {
      fileType = 'office'
    }
    
    // For text files, read content directly and don't upload to OpenAI
    if (fileType === 'text') {
      try {
        fileContent = await file.text()
        shouldUploadToOpenAI = false
        console.log(`[UPLOAD] Read text file content: ${fileContent.length} characters`)
        
        return c.json({
          fileId: null, // No OpenAI file ID for text files
          filename: file.name,
          bytes: file.size,
          content: fileContent,
          fileType: 'text',
          message: 'Text file content read successfully (not uploaded to OpenAI)'
        })
      } catch (error) {
        console.error('Error reading text file:', error)
        return c.json({ error: 'Failed to read text file content' }, 500)
      }
    }
    
    // For PDF, image, and Office files, upload to OpenAI Files API
    if (shouldUploadToOpenAI) {
      const openaiFormData = new FormData()
      openaiFormData.append('file', file)
      
      // Use appropriate purpose based on file type
      if (fileType === 'office') {
        openaiFormData.append('purpose', 'assistants') // Code Interpreter requires assistants purpose
      } else {
        openaiFormData.append('purpose', 'user_data') // For direct model input (PDF, images)
      }

      const uploadResponse = await fetch('https://api.openai.com/v1/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`
        },
        body: openaiFormData
      })

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.text()
        console.error('OpenAI Files API Error:', errorData)
        return c.json({ 
          error: 'File upload to OpenAI failed', 
          details: errorData,
          suggestion: fileType === 'office' ? 'Office files require Code Interpreter. Please ensure the file is not corrupted.' : 'Please try a different file format.'
        }, 500)
      }

      const uploadData = await uploadResponse.json()
      console.log(`[UPLOAD] Successfully uploaded to OpenAI: ${uploadData.id} (${fileType})`)

      return c.json({
        fileId: uploadData.id,
        filename: uploadData.filename,
        bytes: uploadData.bytes,
        content: null,
        fileType: fileType,
        requiresCodeInterpreter: fileType === 'office',
        message: fileType === 'office' 
          ? '✅ Office file uploaded successfully! Will use Code Interpreter for analysis.' 
          : 'File uploaded to OpenAI successfully',
        codeInterpreterReady: fileType === 'office',
        apiMethod: fileType === 'office' ? 'assistants_code_interpreter' : 'responses'
      })
    }

  } catch (error) {
    console.error('Upload endpoint error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Get supported file formats
app.get('/api/supported-formats', async (c) => {
  return c.json({
    supported: ALL_SUPPORTED_EXTENSIONS,
    categories: {
      text: SUPPORTED_FILE_FORMATS.text,
      pdf: SUPPORTED_FILE_FORMATS.responses_api,
      images: SUPPORTED_FILE_FORMATS.images,
      office: SUPPORTED_FILE_FORMATS.office
    },
    tools: {
      code_interpreter: 'Required for Office files (.xlsx, .docx, .pptx)',
      web_search: 'Optional for real-time information',
      direct_input: 'Used for PDF and image files'
    },
    message: 'GPT-5 supported file formats with Code Interpreter for Office files'
  })
})

// Generated file download proxy (OpenAI Files -> User)
app.get('/api/openai-files/:id/content', async (c) => {
  try {
    const openaiKey = c.env.OPENAI_API_KEY
    if (!openaiKey) {
      return c.json({ error: 'OpenAI API key not configured' }, 400)
    }

    const fileId = c.req.param('id')
    
    const response = await fetch(`https://api.openai.com/v1/files/${fileId}/content`, {
      headers: { 'Authorization': `Bearer ${openaiKey}` }
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      return c.text(errorText, response.status)
    }
    
    // Pass through content-type from OpenAI
    const contentType = response.headers.get('Content-Type') || 'application/octet-stream'
    
    return new Response(response.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600'
      }
    })
    
  } catch (error) {
    console.error('File content proxy error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Get uploaded files list
app.get('/api/files', async (c) => {
  try {
    const openaiKey = c.env.OPENAI_API_KEY
    if (!openaiKey) {
      return c.json({ error: 'OpenAI API key not configured' }, 400)
    }

    const filesResponse = await fetch('https://api.openai.com/v1/files', {
      headers: {
        'Authorization': `Bearer ${openaiKey}`
      }
    })

    if (!filesResponse.ok) {
      return c.json({ error: 'Failed to fetch files' }, 500)
    }

    const filesData = await filesResponse.json()
    return c.json(filesData)

  } catch (error) {
    console.error('Files list error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Delete file endpoint
app.delete('/api/files/:id', async (c) => {
  try {
    const openaiKey = c.env.OPENAI_API_KEY
    if (!openaiKey) {
      return c.json({ error: 'OpenAI API key not configured' }, 400)
    }

    const fileId = c.req.param('id')

    const deleteResponse = await fetch(`https://api.openai.com/v1/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${openaiKey}`
      }
    })

    if (!deleteResponse.ok) {
      return c.json({ error: 'Failed to delete file' }, 500)
    }

    const deleteData = await deleteResponse.json()
    return c.json(deleteData)

  } catch (error) {
    console.error('File delete error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Main page
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>OpenAI ChatBot (GPT-5 + Responses API)</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
            tailwind.config = {
                theme: {
                    extend: {}
                }
            }
        </script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        
        <!-- Markdown → HTML -->
        <script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/lib/marked.umd.min.js"></script>
        <!-- XSS対策のサニタイズ -->
        <script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js"></script>
        <!-- コードハイライト -->
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism.min.css">
        <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-core.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/plugins/autoloader/prism-autoloader.min.js"></script>
        
        <link href="/static/style.css" rel="stylesheet">
    </head>
    <body class="bg-gray-100 min-h-screen">
        <div class="flex h-screen">
            <!-- 左ペイン: 会話履歴 -->
            <div class="w-80 bg-gray-50 border-r border-gray-200 flex flex-col">
                <!-- ヘッダー -->
                <div class="p-4 border-b border-gray-200">
                    <h2 class="text-lg font-semibold text-gray-800 mb-2">
                        <i class="fas fa-history mr-2 text-blue-600"></i>
                        会話履歴
                    </h2>
                    <button id="newThreadButton" class="w-full bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-sm transition-colors">
                        <i class="fas fa-plus mr-2"></i>
                        新しい会話
                    </button>
                </div>
                
                <!-- スレッドリスト -->
                <div class="flex-1 overflow-y-auto">
                    <div id="threadList" class="p-2">
                        <!-- スレッドがここに動的に追加される -->
                        <div class="text-center text-gray-500 text-sm mt-8">
                            <i class="fas fa-comment-dots text-2xl mb-2"></i>
                            <p>まだ会話がありません</p>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- 右ペイン: チャット画面 -->
            <div class="flex-1 flex flex-col">
                <!-- チャットヘッダー -->
                <div class="bg-white border-b border-gray-200 px-6 py-4">
                    <div class="flex items-center justify-between">
                        <div>
                            <h1 class="text-xl font-bold text-gray-800">
                                <i class="fas fa-robot mr-2 text-blue-600"></i>
                                <span id="currentThreadTitle">GPT-5 ChatBot</span>
                            </h1>
                            <p class="text-sm text-gray-600">
                                <i class="fas fa-lightning-bolt mr-1 text-yellow-500"></i>
                                Powered by <span class="font-bold text-blue-600">GPT-5</span> (No Fallback)
                                <span class="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs ml-2">
                                    <i class="fas fa-shield-alt mr-1"></i>
                                    Exclusive Mode
                                </span>
                            </p>
                        </div>
                        <div class="flex gap-2">
                            <span id="currentThreadId" class="text-xs text-gray-400"></span>
                        </div>
                    </div>
                </div>
                
                <!-- Feature buttons -->
                <div class="bg-white border-b border-gray-200 px-6 py-3">
                    <div class="flex flex-wrap gap-2">
                        <button id="toggleSearch" class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded text-sm transition-colors">
                            <i class="fas fa-search mr-1"></i>Web検索: OFF
                        </button>
                        <label for="fileInput" class="bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded cursor-pointer text-sm transition-colors">
                            <i class="fas fa-upload mr-1"></i>ファイル
                        </label>
                        <input type="file" id="fileInput" class="hidden" accept=".txt,.md,.json,.csv,.log,.pdf,.png,.jpg,.jpeg,.gif,.webp,.xlsx,.xls,.docx,.doc,.pptx,.ppt" />
                        <button id="clearChat" class="bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded text-sm transition-colors">
                            <i class="fas fa-trash mr-1"></i>クリア
                        </button>
                    </div>
                </div>

                <!-- API Status -->
                <div id="apiStatus" class="mb-4 p-3 bg-blue-50 border-l-4 border-blue-400">
                    <div class="flex items-center text-blue-800">
                        <i class="fas fa-info-circle mr-2"></i>
                        <span>API状態: <span id="apiStatusText">未確認</span></span>
                    </div>
                </div>

                <!-- File status -->
                <div id="fileStatus" class="mb-4 p-3 bg-blue-100 border-l-4 border-blue-500 hidden">
                    <div class="flex items-center">
                        <i class="fas fa-file-alt text-blue-600 mr-2"></i>
                        <span id="fileStatusText"></span>
                        <button id="clearFile" class="ml-auto text-red-600 hover:text-red-800">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                <!-- Chat messages -->
                <div class="flex-1 overflow-hidden flex flex-col">
                    <div id="chatMessages" class="flex-1 overflow-y-auto p-6">
                        <div class="text-center text-gray-500">
                            <i class="fas fa-comments text-4xl mb-2"></i>
                            <p><span class="text-blue-600 font-bold">GPT-5</span>との新しい会話を開始しましょう</p>
                            <p class="text-sm mt-1">Web検索とファイルアップロード機能が利用できます。</p>
                            <p class="text-xs mt-1 text-gray-400">
                                <i class="fas fa-file mr-1"></i>
                                対応形式: Office(.xlsx,.docx,.pptx) 🔧 Code Interpreter, PDF, テキスト(.txt,.md,.csv), 画像(.png,.jpg,.jpeg,.gif,.webp)
                            </p>
                            <p class="text-xs mt-2 text-purple-600">
                                <i class="fas fa-magic mr-1"></i>
                                GPT-5 × Responses API Enhanced Mode
                            </p>
                        </div>
                    </div>
                    
                    <!-- Input area -->
                    <div class="bg-white border-t border-gray-200 p-4">
                        <div class="flex gap-2">
                            <input 
                                type="text" 
                                id="messageInput" 
                                placeholder="メッセージを入力してください..."
                                class="flex-1 p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                            <button 
                                id="sendButton" 
                                class="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                    </div>
                </div>
                
            </div>
        </div>
        
        <!-- Status area -->
        <div id="status" class="fixed bottom-4 right-4 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-600 shadow-lg" style="display: none;"></div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script src="/static/app.js"></script>
    </body>
    </html>
  `)
})

// Thread management API endpoints (for future server-side persistence)
app.get('/api/threads', async (c) => {
  // For now, return empty array - threads are managed client-side
  return c.json({ threads: [], message: 'Thread management is handled client-side via localStorage' })
})

app.post('/api/threads', async (c) => {
  // For now, return success - threads are managed client-side
  return c.json({ success: true, message: 'Thread management is handled client-side via localStorage' })
})

app.put('/api/threads/:id', async (c) => {
  // For now, return success - threads are managed client-side
  return c.json({ success: true, message: 'Thread management is handled client-side via localStorage' })
})

app.delete('/api/threads/:id', async (c) => {
  // For now, return success - threads are managed client-side
  return c.json({ success: true, message: 'Thread management is handled client-side via localStorage' })
})

export default app