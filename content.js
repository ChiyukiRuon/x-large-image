(() => {
    const selector = 'article[data-testid="tweet"]'
    const states = new WeakMap()
    const defaultTitle = '获取原图，横向拼接并下载 PNG'

    function resetButton(state) {
        clearTimeout(state.resetTimer)
        state.resetTimer = null
        state.button.textContent = '拼接下载'
        state.button.title = defaultTitle
    }

    function collect(article) {
        // The timestamp identifies the outer tweet, excluding quoted-tweet media.
        const permalink = [...article.querySelectorAll('a[href*="/status/"]')]
            .find(link => link.querySelector('time') && link.closest(selector) === article)
        const statusId = permalink?.getAttribute('href')?.match(/\/status\/(\d+)/)?.[1]
        if (!statusId) return null
        const photos = new Map()
        for (const link of article.querySelectorAll('a[href*="/photo/"]')) {
            if (link.closest(selector) !== article) continue
            const photo = XLargeImage.photoLink(link.href)
            if (!photo || photo.statusId !== statusId) continue
            const img = link.querySelector('img[src*="pbs.twimg.com/media/"]')
            if (!img) continue
            try {
                photos.set(photo.index, XLargeImage.originalUrl(img.src))
            } catch { /* Ignore unrelated or unsupported media. */ }
        }
        const ordered = [...photos].sort((a, b) => a[0] - b[0])
        if (ordered.length < 2 || ordered.some(([index], position) => index !== position + 1)) return null
        return { statusId, images: ordered.map(([, url]) => url) }
    }

    function refresh(article) {
        const job = collect(article)
        let state = states.get(article)
        if (!job) {
            clearTimeout(state?.resetTimer)
            state?.button.remove()
            states.delete(article)
            return
        }
        if (!state || !article.contains(state.button)) {
            clearTimeout(state?.resetTimer)
            const button = document.createElement('button')
            button.type = 'button'
            button.className = 'xli-stitch-button'
            button.title = defaultTitle
            state = { button, job, busy: false, resetTimer: null }
            states.set(article, state)
            button.addEventListener('click', async event => {
                event.preventDefault()
                event.stopPropagation()
                if (state.busy) return
                clearTimeout(state.resetTimer)
                state.resetTimer = null
                state.busy = true
                button.disabled = true
                button.textContent = '正在拼接…'
                button.title = defaultTitle
                try {
                    const current = collect(article)
                    if (!current) throw new Error('图片已变化，请刷新重试')
                    const response = await chrome.runtime.sendMessage({ type: 'xli:download', job: current })
                    if (!response?.ok) throw new Error(response?.error || '请刷新页面重试')
                    button.textContent = '已发起下载'
                    button.title = '再次点击可重新拼接下载'
                } catch (error) {
                    button.textContent = '拼接失败，请重试'
                    button.title = error.message
                } finally {
                    state.busy = false
                    button.disabled = false
                    state.resetTimer = setTimeout(() => resetButton(state), 2000)
                }
            })
            const actions = article.querySelector('[role="group"]')
            if (actions?.parentElement) actions.before(button)
            else article.append(button)
        }
        if (!state.button.textContent || JSON.stringify(state.job) !== JSON.stringify(job)) {
            if (!state.busy) resetButton(state)
        }
        state.job = job
    }

    const pending = new Set()
    let timer
    function queue(article) {
        pending.add(article)
        if (timer) return
        timer = setTimeout(() => {
            timer = null
            for (const item of pending) if (item.isConnected) refresh(item)
            pending.clear()
        }, 150)
    }
    const observer = new MutationObserver(records => {
        for (const record of records) {
            const target = record.target instanceof Element ? record.target : record.target.parentElement
            if (target?.closest('.xli-stitch-button')) continue
            const article = target?.closest(selector)
            if (article) queue(article)
            for (const node of record.addedNodes) {
                if (!(node instanceof Element)) continue
                if (node.matches(selector)) queue(node)
                node.querySelectorAll(selector).forEach(queue)
            }
        }
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'href'] })
    document.querySelectorAll(selector).forEach(queue)
})()
