// ===== Markdown → HTML =====
function renderMarkdown(md) {
  // GFM(表)と改行を有効化
  if (window.marked) marked.setOptions({ gfm: true, breaks: true, headerIds: false, mangle: false });

  const dirty = window.marked ? marked.parse(String(md ?? "")) : String(md ?? "");
  // table 系タグが落ちないように保険で許可（DOMPurifyは通常デフォで許可しますが安全側）
  const clean = window.DOMPurify
    ? DOMPurify.sanitize(dirty, {
        ADD_TAGS: ["table", "thead", "tbody", "tr", "th", "td"],
        ADD_ATTR: ["align", "colspan", "rowspan"]
      })
    : dirty;

  const wrapper = document.createElement("div");
  wrapper.className = "markdown";
  wrapper.innerHTML = clean;

  // 表は横スクロール可に
  wrapper.querySelectorAll("table").forEach((table) => {
    const scroller = document.createElement("div");
    scroller.className = "overflow-x-auto";
    table.parentNode.insertBefore(scroller, table);
    scroller.appendChild(table);
  });

  // コードハイライト（動的挿入対応）
  if (window.Prism) Prism.highlightAllUnder(wrapper);

  return wrapper;
}

// ===== メッセージ描画（★ここが肝） =====
// 既存の appendMessage と同名なら中身をこれで置き換え
function appendMessage(role, text) {
  const chat = document.getElementById("chatMessages");

  const row = document.createElement("div");
  row.className = `mb-4 flex ${role === "user" ? "justify-end" : "justify-start"}`;

  const bubble = document.createElement("div");
  bubble.className =
    (role === "user"
      ? "bg-blue-600 text-white"
      : "bg-white text-gray-800 border") + " rounded-lg px-4 py-3 shadow max-w-[min(780px,90%)]";

  // ★これまで textContent/innerText で入れていた所を必ず置き換える
  bubble.appendChild(renderMarkdown(text));

  row.appendChild(bubble);
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
}

class ChatBot {
    constructor() {
        this.messages = []
        this.useSearch = false
        this.currentFile = null
        this.currentFileContent = null
        this.currentFileIds = [] // Store file IDs for proper file handling
        
        // Thread management
        this.currentThreadId = null
        this.threads = new Map() // threadId -> {title, messages, createdAt, updatedAt}
        
        // グローバルデバッグ用
        window.chatBot = this // デバッグ用グローバル参照
        
        this.initializeElements()
        this.bindEvents()
        this.initializeThreadSystem()
        
        console.log('[INIT] ChatBot initialized with thread system')
    }
    
    initializeElements() {
        this.chatMessages = document.getElementById('chatMessages')
        this.messageInput = document.getElementById('messageInput')
        this.sendButton = document.getElementById('sendButton')
        this.toggleSearchButton = document.getElementById('toggleSearch')
        this.fileInput = document.getElementById('fileInput')
        this.fileStatus = document.getElementById('fileStatus')
        this.fileStatusText = document.getElementById('fileStatusText')
        this.clearFileButton = document.getElementById('clearFile')
        this.clearChatButton = document.getElementById('clearChat')
        this.status = document.getElementById('status')
        this.apiStatus = document.getElementById('apiStatus')
        this.apiStatusText = document.getElementById('apiStatusText')
        
        // Thread management elements
        this.newThreadButton = document.getElementById('newThreadButton')
        this.threadList = document.getElementById('threadList')
        this.currentThreadTitle = document.getElementById('currentThreadTitle')
        this.currentThreadIdElement = document.getElementById('currentThreadId')
    }
    
    bindEvents() {
        this.sendButton.addEventListener('click', () => this.sendMessage())
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage()
            }
        })
        
        this.toggleSearchButton.addEventListener('click', () => this.toggleSearch())
        this.fileInput.addEventListener('change', (e) => this.handleFileUpload(e))
        this.clearFileButton.addEventListener('click', () => this.clearFile())
        this.clearChatButton.addEventListener('click', () => this.clearCurrentThread())
        
        // Thread management events
        this.newThreadButton.addEventListener('click', () => this.createNewThread())
    }
    
    toggleSearch() {
        this.useSearch = !this.useSearch
        this.toggleSearchButton.textContent = `Web検索: ${this.useSearch ? 'ON' : 'OFF'}`
        this.toggleSearchButton.innerHTML = `<i class="fas fa-search mr-2"></i>Web検索: ${this.useSearch ? 'ON' : 'OFF'}`
        
        if (this.useSearch) {
            this.toggleSearchButton.className = 'bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors'
        } else {
            this.toggleSearchButton.className = 'bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition-colors'
        }
        
        this.showStatus(`Web検索が${this.useSearch ? '有効' : '無効'}になりました`)
    }
    
    async handleFileUpload(event) {
        const file = event.target.files[0]
        if (!file) {
            console.log('[UPLOAD] No file selected')
            return
        }
        
        console.log('[UPLOAD] Starting upload for file:', file.name, 'Size:', file.size)
        this.showStatus('ファイルをアップロード中...')
        
        try {
            const formData = new FormData()
            formData.append('file', file)
            
            console.log('[UPLOAD] Sending to /api/upload')
            const response = await fetch('/api/upload', { 
                method: 'POST', 
                body: formData 
            })
            
            console.log('[UPLOAD] Response status:', response.status)
            const responseData = await response.json()
            console.log('[UPLOAD] Response data:', responseData)
            
            if (!response.ok || !responseData.fileId) {
                const errorMsg = responseData.details || responseData.error || 'Unknown error'
                console.error('[UPLOAD] Upload failed:', errorMsg)
                alert('アップロード失敗: ' + errorMsg)
                return
            }
            
            // 超重要：file_id を確実に保持
            console.log('[UPLOAD] Before adding - current fileIds:', this.currentFileIds)
            
            // OpenAIのFile IDは通常 'file-...' の形式。prefix判定は不要にする
            if (typeof responseData.fileId === 'string') {
                // 既存のIDをクリアして新しいものを追加（単一ファイル用）
                this.currentFileIds = [responseData.fileId]
                
                console.log('[UPLOAD] ✅ File ID successfully added:', responseData.fileId)
                console.log('[UPLOAD] ✅ Current fileIds array:', this.currentFileIds)
                console.log('[UPLOAD] ✅ fileIds length:', this.currentFileIds.length)
                
                // インスタンス変数も更新
                this.currentFile = responseData
                this.currentFileContent = responseData.content || null
                
                // UI更新
                this.fileStatus.classList.remove('hidden')
                this.fileStatusText.textContent = `添付: ${responseData.filename} (${Math.round(responseData.bytes/1024)} KB) - ID: ${responseData.fileId}`
                
                this.showStatus(`ファイルアップロード完了: ${responseData.filename}`)
                
            } else {
                console.error('[UPLOAD] ❌ No valid file ID received:', responseData)
                alert('無効なファイルIDが返されました')
            }
            
        } catch (error) {
            console.error('[UPLOAD] ❌ Upload error:', error)
            this.showStatus('ファイルアップロードエラー: ' + error.message)
            alert('アップロードエラー: ' + error.message)
        }
        
        // Clear the file input
        event.target.value = ''
    }
    
    clearFile() {
        console.log('[CLEAR] ========== ファイルクリア ==========')
        console.log('[CLEAR] Before clear - fileIds:', this.currentFileIds)
        console.log('[CLEAR] Before clear - fileIds length:', this.currentFileIds.length)
        
        this.currentFile = null
        this.currentFileContent = null
        this.currentFileIds = []
        this.fileStatus.classList.add('hidden')
        
        console.log('[CLEAR] After clear - fileIds:', this.currentFileIds)
        console.log('[CLEAR] After clear - fileIds length:', this.currentFileIds.length)
        
        this.showStatus('ファイルがクリアされました')
    }
    
    clearCurrentThread() {
        if (this.currentThreadId) {
            this.messages = []
            this.updateChatDisplay()
            this.saveCurrentThread()
            this.showStatus('現在のスレッドがクリアされました')
        }
    }
    
    async sendMessage() {
        const message = this.messageInput.value.trim()
        if (!message) return
        
        this.addMessage('user', message)
        this.messageInput.value = ''
        this.sendButton.disabled = true
        this.showStatus('ChatBotが回答中...')
        
        try {
            // ★★★ 超重要：送信前の状態を詳細チェック ★★★
            console.log('[SEND] ========== 送信前デバッグ情報 ==========')
            console.log('[SEND] this.currentFileIds:', this.currentFileIds)
            console.log('[SEND] fileIds length:', this.currentFileIds ? this.currentFileIds.length : 'undefined')
            console.log('[SEND] fileIds type:', typeof this.currentFileIds)
            console.log('[SEND] fileIds isArray:', Array.isArray(this.currentFileIds))
            
            const requestData = {
                message: message,
                messages: this.messages.slice(-10).map(msg => ({
                    role: msg.role,
                    content: msg.content
                })),
                useSearch: this.useSearch,
                fileContent: this.currentFileContent,
                fileIds: this.currentFileIds || [], // 確実に配列として送信
                model: 'gpt-5' // GPT-5のみ使用（フォールバックなし）
            }
            
            console.log('[SEND] ★ Final payload fileIds:', requestData.fileIds)
            console.log('[SEND] ★ Final payload fileIds length:', requestData.fileIds.length)
            console.log('[SEND] ★ Complete payload:', JSON.stringify(requestData, null, 2))
            
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            })
            
            const responseData = await response.json()
            console.log('[FRONTEND] Response data:', responseData)
            
            let statusInfo = []
            if (responseData.searchUsed) statusInfo.push('Web検索使用')
            if (responseData.fileUsed) statusInfo.push('ファイル内容参照')
            
            // サーバが本当に添付を見ているかを表示
            if (typeof responseData.attachmentsSeen === 'number') {
                const debugMessage = `サーバが認識した添付: ${responseData.attachmentsSeen} 件（受信 fileIds: ${responseData.receivedFileIds || 0}）`
                this.showStatus(debugMessage)
                console.log('[FRONTEND] Debug message:', debugMessage)
                setTimeout(() => {
                    statusInfo.push(`添付認識: ${responseData.attachmentsSeen}件`)
                }, 1000)
            }
            
            // Update API status with diagnostic information
            this.updateApiStatus(responseData.apiUsed || 'unknown', responseData.diagnostic)
            
            this.addMessage('assistant', responseData.message)
            
            // GPT-5 only diagnostic display
            let modelInfo = ''
            if (responseData.diagnostic) {
                const d = responseData.diagnostic
                modelInfo = ` (GPT-5専用)`
                
                if (d.partial) {
                    modelInfo += ' [Partial]'
                }
            }
            
            const apiInfo = responseData.apiUsed === 'responses' ? ` + Responses API${modelInfo}` : modelInfo
            
            setTimeout(() => {
                this.showStatus(statusInfo.length > 0 ? `回答完了 (${statusInfo.join(', ')})${apiInfo}` : `回答完了${apiInfo}`)
            }, 2000)
            
        } catch (error) {
            console.error('Chat error:', error)
            const errorMsg = error.message
            this.addMessage('system', `エラーが発生しました: ${errorMsg}`)
            this.showStatus('エラー: ' + errorMsg)
        } finally {
            this.sendButton.disabled = false
        }
    }
    
    addMessage(role, content) {
        const messageObj = { role, content, timestamp: new Date() }
        this.messages.push(messageObj)

        // 初期のウェルカム表示があれば除去
        const welcomeMsg = this.chatMessages.querySelector('.text-center.text-gray-500')
        if (welcomeMsg) welcomeMsg.remove()

        // ★ Markdownで描画（チャット中も過去スレ同様に）
        appendMessage(role, content)

        // スクロール＆保存
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight
        this.saveCurrentThread()
        this.updateThreadListUI()
    }
    
    escapeHtml(text) {
        const div = document.createElement('div')
        div.textContent = text
        return div.innerHTML
    }
    
    renderMarkdown(md) {
        if (!md) return ''
        
        // Markedライブラリが利用可能な場合は使用
        if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
            try {
                // Markedの設定（GFMで表を有効、改行は<br>）
                marked.setOptions({
                    gfm: true,
                    breaks: true,
                    headerIds: false, // HタグのID付与を無効化
                    mangle: false
                })

                const raw = marked.parse(String(md ?? ''))
                
                // DOMPurifyでサニタイズ
                const sanitized = DOMPurify.sanitize(raw, {
                    ADD_ATTR: ['target', 'rel'] // リンクの属性を許可
                })

                // table を横スクロール可能にラップ
                const wrapper = document.createElement('div')
                wrapper.className = 'markdown prose max-w-none'
                wrapper.innerHTML = sanitized

                // テーブルに横スクロールラッパを付与
                wrapper.querySelectorAll('table').forEach((table) => {
                    const scroller = document.createElement('div')
                    scroller.className = 'overflow-x-auto'
                    table.parentNode.insertBefore(scroller, table)
                    scroller.appendChild(table)

                    // Tailwindで少し詰める
                    table.classList.add('text-sm')
                })

                // リンクを新規タブ＋安全属性に
                wrapper.querySelectorAll('a[href]').forEach(a => {
                    a.setAttribute('target', '_blank')
                    a.setAttribute('rel', 'noopener noreferrer')
                })

                // コードハイライト
                if (window.Prism) {
                    wrapper.querySelectorAll('pre code').forEach(block => {
                        Prism.highlightElement(block)
                    })
                }

                return wrapper.innerHTML
            } catch (error) {
                console.warn('Marked.js rendering failed, using fallback:', error)
            }
        }
        
        // フォールバック: 基本的なマークダウン処理
        return this.renderMarkdownFallback(md)
    }
    
    // フォールバック用の基本マークダウンレンダリング
    renderMarkdownFallback(text) {
        if (!text) return ''
        
        let html = this.escapeHtml(text)
        
        // コードブロック (```)
        html = html.replace(/```([\s\S]*?)```/g, '<pre class="bg-gray-800 text-green-400 p-3 rounded-lg overflow-x-auto text-sm my-2"><code>$1</code></pre>')
        
        // インラインコード (`)
        html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-600 text-green-300 px-1 py-0.5 rounded text-sm">$1</code>')
        
        // 見出し
        html = html.replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
        html = html.replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold mt-4 mb-2">$1</h2>')
        html = html.replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>')
        
        // 太字
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold">$1</strong>')
        
        // イタリック
        html = html.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
        
        // リンク
        html = html.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '<a href="$2" class="text-blue-300 hover:text-blue-200 underline" target="_blank" rel="noopener noreferrer">$1</a>')
        
        // 番号付きリスト
        html = html.replace(/^(\d+)\. (.*)$/gm, '<li>$2</li>')
        html = html.replace(/((?:<li>[^<]*<\/li>\n?)+)/g, '<ol class="list-decimal list-inside space-y-1 my-2">$1</ol>')
        
        // 箇条書きリスト
        html = html.replace(/^[\-\*\+] (.*)$/gm, '<li>$1</li>')
        html = html.replace(/((?:<li>[^<]*<\/li>\n?)+)/g, '<ul class="list-disc list-inside space-y-1 my-2">$1</ul>')
        
        // 引用
        html = html.replace(/^> (.*)$/gm, '<blockquote class="border-l-4 border-gray-400 pl-4 italic my-2">$1</blockquote>')
        
        // 段落（連続する改行を段落区切りとして扱う）
        const paragraphs = html.split(/\n\s*\n/)
        html = paragraphs.map(p => {
            p = p.trim()
            if (!p) return ''
            // 既にHTMLタグで囲まれている場合はそのまま
            if (p.match(/^<(h[1-6]|ul|ol|blockquote|pre|div)/)) {
                return p
            }
            return `<p class="mb-2">${p}</p>`
        }).join('')
        
        // 単一の改行を<br>に変換（段落内）
        html = html.replace(/([^>])\n([^<])/g, '$1<br>$2')
        
        return html
    }
    
    showStatus(message) {
        this.status.textContent = message
        this.status.style.display = 'block'
        setTimeout(() => {
            this.status.style.display = 'none'
        }, 3000)
    }
    
    // Legacy method - now handled by thread system
    saveChatHistory() {
        this.saveCurrentThread()
    }
    
    updateApiStatus(apiUsed, diagnostic) {
        if (!apiUsed) return
        
        let statusText, statusClass
        
        switch (apiUsed) {
            case 'responses':
                let modelDisplay = 'GPT-5'
                if (diagnostic) {
                    if (diagnostic.fallbackUsed) {
                        modelDisplay = `${diagnostic.modelRequested} → ${diagnostic.modelUsed}`
                    } else {
                        modelDisplay = diagnostic.modelUsed
                    }
                    
                    if (diagnostic.partial) {
                        modelDisplay += ' [Partial Result]'
                    }
                }
                
                statusText = `✅ ${modelDisplay} + Responses APIモード`
                statusClass = 'bg-purple-50 border-purple-400'
                this.apiStatusText.className = 'text-purple-800'
                break
            default:
                statusText = '❌ API接続エラー'
                statusClass = 'bg-red-50 border-red-400'
                this.apiStatusText.className = 'text-red-800'
        }
        
        this.apiStatus.className = `mb-4 p-3 ${statusClass} border-l-4`
        this.apiStatusText.textContent = statusText
        
        // Add diagnostic details if available
        if (diagnostic && diagnostic.modelsTried && diagnostic.modelsTried.length > 1) {
            const diagnosticDiv = document.createElement('div')
            diagnosticDiv.className = 'text-xs mt-1 opacity-75'
            diagnosticDiv.textContent = `Models tried: ${diagnostic.modelsTried.join(' → ')}`
            
            // Remove existing diagnostic div
            const existing = this.apiStatus.querySelector('.diagnostic-details')
            if (existing) existing.remove()
            
            diagnosticDiv.className += ' diagnostic-details'
            this.apiStatus.appendChild(diagnosticDiv)
        }
    }
    
    // Thread System Methods
    initializeThreadSystem() {
        // Load threads from localStorage
        this.loadThreads()
        
        // Load current thread from cookie
        const savedThreadId = this.getCookie('currentThreadId')
        
        if (savedThreadId && this.threads.has(savedThreadId)) {
            this.switchToThread(savedThreadId)
        } else {
            // Create initial thread if none exists
            this.createNewThread()
        }
        
        this.updateThreadListUI()
    }
    
    getCookie(name) {
        const value = `; ${document.cookie}`
        const parts = value.split(`; ${name}=`)
        if (parts.length === 2) {
            return parts.pop().split(';').shift()
        }
        return null
    }
    
    setCookie(name, value, days = 30) {
        const expires = new Date()
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000))
        document.cookie = `${name}=${value}; expires=${expires.toUTCString()}; path=/`
    }
    
    generateThreadId() {
        return 'thread_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9)
    }
    
    createNewThread() {
        const threadId = this.generateThreadId()
        const thread = {
            title: '新しい会話',
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }
        
        this.threads.set(threadId, thread)
        this.switchToThread(threadId)
        this.saveThreads()
        this.updateThreadListUI()
        
        console.log(`[THREAD] Created new thread: ${threadId}`)
    }
    
    switchToThread(threadId) {
        if (!this.threads.has(threadId)) {
            console.error(`[THREAD] Thread not found: ${threadId}`)
            return
        }
        
        // Save current thread before switching
        if (this.currentThreadId) {
            this.saveCurrentThread()
        }
        
        // Switch to new thread
        this.currentThreadId = threadId
        const thread = this.threads.get(threadId)
        this.messages = [...thread.messages]
        
        // Update UI
        this.updateChatDisplay()
        this.updateCurrentThreadInfo(thread)
        
        // Save to cookie
        this.setCookie('currentThreadId', threadId)
        
        console.log(`[THREAD] Switched to thread: ${threadId}`)
    }
    
    saveCurrentThread() {
        if (!this.currentThreadId) return
        
        const thread = this.threads.get(this.currentThreadId)
        if (thread) {
            thread.messages = [...this.messages]
            thread.updatedAt = new Date().toISOString()
            
            // Auto-generate title from first message if still default
            if (thread.title === '新しい会話' && this.messages.length > 0) {
                const firstUserMessage = this.messages.find(m => m.role === 'user')
                if (firstUserMessage && firstUserMessage.content) {
                    thread.title = firstUserMessage.content.substring(0, 30) + (firstUserMessage.content.length > 30 ? '...' : '')
                }
            }
            
            this.threads.set(this.currentThreadId, thread)
            this.saveThreads()
        }
    }
    
    loadThreads() {
        try {
            const saved = localStorage.getItem('chatThreads')
            if (saved) {
                const threadsObj = JSON.parse(saved)
                this.threads = new Map(Object.entries(threadsObj))
                console.log(`[THREAD] Loaded ${this.threads.size} threads`)
            }
        } catch (error) {
            console.warn('Failed to load threads:', error)
            this.threads = new Map()
        }
    }
    
    saveThreads() {
        try {
            const threadsObj = Object.fromEntries(this.threads)
            localStorage.setItem('chatThreads', JSON.stringify(threadsObj))
            console.log(`[THREAD] Saved ${this.threads.size} threads`)
        } catch (error) {
            console.error('Failed to save threads:', error)
        }
    }
    
    updateChatDisplay() {
        if (this.messages.length === 0) {
            this.chatMessages.innerHTML = `
                <div class="text-center text-gray-500">
                    <i class="fas fa-comments text-4xl mb-2"></i>
                    <p><span class="text-blue-600 font-bold">GPT-5</span>との新しい会話を開始しましょう</p>
                    <p class="text-sm mt-1">Web検索とファイルアップロード機能が利用できます。</p>
                </div>
            `
        } else {
            this.chatMessages.innerHTML = ''
            this.messages.forEach(msg => {
                this.addMessageToUI(msg)
            })
        }
    }
    
    updateCurrentThreadInfo(thread) {
        this.currentThreadTitle.textContent = thread.title
        this.currentThreadIdElement.textContent = `Thread ID: ${this.currentThreadId}`
    }
    
    updateThreadListUI() {
        const threadArray = Array.from(this.threads.entries())
        threadArray.sort(([,a], [,b]) => new Date(b.updatedAt) - new Date(a.updatedAt))
        
        if (threadArray.length === 0) {
            this.threadList.innerHTML = `
                <div class="text-center text-gray-500 text-sm mt-8">
                    <i class="fas fa-comment-dots text-2xl mb-2"></i>
                    <p>まだ会話がありません</p>
                </div>
            `
            return
        }
        
        this.threadList.innerHTML = threadArray.map(([threadId, thread]) => {
            const isActive = threadId === this.currentThreadId
            const messageCount = thread.messages.length
            const lastMessage = thread.messages[thread.messages.length - 1]
            const preview = lastMessage && lastMessage.content ? lastMessage.content.substring(0, 50) + '...' : 'メッセージなし'
            
            return `
                <div class="thread-item p-3 mb-2 rounded-lg cursor-pointer transition-colors ${
                    isActive ? 'bg-blue-100 border border-blue-300' : 'bg-white border border-gray-200 hover:bg-gray-50'
                }" data-thread-id="${threadId}">
                    <div class="flex items-start justify-between">
                        <div class="flex-1 min-w-0">
                            <h3 class="text-sm font-medium text-gray-900 truncate">${this.escapeHtml(thread.title)}</h3>
                            <p class="text-xs text-gray-500 mt-1 line-clamp-2">${this.escapeHtml(preview)}</p>
                            <div class="flex items-center justify-between mt-2">
                                <span class="text-xs text-gray-400">
                                    <i class="fas fa-message mr-1"></i>
                                    ${messageCount}
                                </span>
                                <span class="text-xs text-gray-400">
                                    ${new Date(thread.updatedAt).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            `
        }).join('')
        
        // Add click event listeners
        this.threadList.querySelectorAll('.thread-item').forEach(item => {
            item.addEventListener('click', () => {
                const threadId = item.dataset.threadId
                if (threadId !== this.currentThreadId) {
                    this.switchToThread(threadId)
                    this.updateThreadListUI()
                }
            })
        })
    }
    
    addMessageToUI(messageObj) {
        // シンプルにappendMessage関数を使用
        appendMessage(messageObj.role, messageObj.content)
    }
}

// Initialize the ChatBot when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new ChatBot()
})