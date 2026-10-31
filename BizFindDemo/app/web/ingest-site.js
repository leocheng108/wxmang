const state = { options: null, busy: false };

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { accept: 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) throw new Error(body?.error ?? `请求失败：HTTP ${response.status}`);
  return body;
}

function setBusy(busy, label) {
  state.busy = busy;
  $('site-inspect').disabled = busy;
  $('site-apply').disabled = busy;
  $('site-mode-pill').textContent = busy ? label : '只读预检';
  $('site-mode-pill').className = `pill ${busy ? 'pill--warn' : 'pill--ok'}`;
}

function setCores(cores) {
  const select = $('site-core');
  select.innerHTML = '';
  for (const core of cores.filter((item) => item.siteSupported)) {
    const option = document.createElement('option');
    option.value = core.name;
    option.textContent = `${core.name} · ${core.numDocs.toLocaleString()} 篇`;
    select.append(option);
  }
  const preferred = cores.find((core) => core.siteSupported && core.name === 'wxmang')
    ?? cores.find((core) => core.siteSupported);
  if (preferred) select.value = preferred.name;
}

async function loadOptions() {
  try {
    const options = await api('/api/admin/site/options');
    state.options = options;
    $('site-solr-status').textContent = `Solr 已连接 · ${options.cores.length} 个 Core`;
    setCores(options.cores);
    const site = options.configuredSources?.find((source) => source.type === 'site');
    if (site?.url) {
      $('site-url').value = site.url;
      try {
        $('site-hosts').value = new URL(site.url).hostname;
      } catch {
        $('site-hosts').value = '';
      }
      $('site-tag').value = site.tag ?? '网页采集';
      $('site-prefix').value = site.idPrefix ?? 'web';
      if (options.cores.some((core) => core.name === site.core && core.siteSupported)) {
        $('site-core').value = site.core;
      }
    }
  } catch (error) {
    $('site-solr-status').textContent = `Solr 不可用：${error.message}`;
    showToast(error.message);
  }
}

function payload() {
  const url = $('site-url').value.trim();
  if (!url) throw new Error('请输入网页链接');
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('网页链接格式不正确');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('只支持 http/https');
  return {
    url,
    core: $('site-core').value,
    tag: $('site-tag').value.trim() || '网页采集',
    idPrefix: $('site-prefix').value.trim() || $('site-core').value,
    allowedHosts: $('site-hosts').value.trim() || parsed.hostname,
  };
}

function renderInspection(data) {
  $('site-mapping-card').hidden = false;
  $('site-mapping-subtitle').textContent = data.source.canonicalUrl;
  $('site-core-pill').textContent = `${data.source.core} · ${data.source.id}`;
  $('site-core-pill').className = 'pill pill--ok';

  $('site-field-body').innerHTML = data.fields
    .map(
      (item) => `<tr>
        <td><code>${escapeHtml(item.field)}</code></td>
        <td>${escapeHtml(item.value)}</td>
        <td class="source">${escapeHtml(item.source)}</td>
      </tr>`,
    )
    .join('');
  $('site-paragraph-list').innerHTML = data.paragraphs.length
    ? data.paragraphs.map((paragraph) => `<li>${escapeHtml(paragraph)}</li>`).join('')
    : '<li>没有正文段落</li>';
  $('site-paragraph-note').textContent = `前 ${data.paragraphs.length} 段 / 共 ${data.stats.paragraphCount} 段`;
  $('site-inspect-meta').textContent =
    `${data.stats.textLength.toLocaleString()} 字符 · ${data.stats.contentHtmlLength.toLocaleString()} HTML 字符`;
  $('site-html-preview').textContent = data.htmlPreview;
  $('site-reply-count').textContent = `共 ${data.replyCount} 条，标题统一为 RE: 主帖标题，parentId = 主帖 ID`;
  $('site-reply-body').innerHTML = data.replies.length
    ? data.replies
        .map(
          (reply) => `<tr>
            <td><code>${escapeHtml(reply.id)}</code></td>
            <td>${escapeHtml(reply.title)}</td>
            <td>${escapeHtml(reply.author)}</td>
            <td>${escapeHtml(reply.writeTime)}</td>
            <td><code>${escapeHtml(reply.parentId)}</code></td>
            <td title="${escapeHtml(reply.textPreview)}">${reply.paragraphCount} 段</td>
          </tr>`,
        )
        .join('')
    : '<tr><td colspan="6" class="empty">没有回复</td></tr>';
}

function renderSummary(result, apply) {
  $('site-result-card').hidden = false;
  $('site-result-subtitle').textContent = `${result.source.url} → ${result.source.core}`;
  $('site-result-mode').textContent = apply ? '已写入 Solr' : '预检 · 未写入';
  $('site-result-mode').className = `pill ${apply ? 'pill--ok' : 'pill--warn'}`;
  const summary = result.summary;
  $('site-result-stats').innerHTML = [
    ['扫描', summary.scanned],
    ['解析', summary.parsed],
    ['跳过', summary.skipped],
    ['写入', summary.indexed],
    ['删除', summary.deleted],
    ['失败', summary.failed],
    ['写入前', result.before],
    ['写入后', result.after],
  ]
    .map(
      ([label, value]) =>
        `<div class="stat ${label === '失败' && value > 0 ? 'stat--bad' : ''}">
          <span>${label}</span><strong>${Number(value).toLocaleString()}</strong>
        </div>`,
    )
    .join('');
  const errors = $('site-result-errors');
  if (summary.errors.length) {
    errors.hidden = false;
    errors.innerHTML = summary.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('');
  } else {
    errors.hidden = true;
  }
}

async function inspect() {
  if (state.busy) return;
  let data;
  try {
    data = payload();
  } catch (error) {
    showToast(error.message);
    return;
  }
  setBusy(true, '正在解析…');
  try {
    const result = await api('/api/admin/site/inspect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    renderInspection(result);
    $('site-hint').textContent = '已解析网页；未写入 Solr。';
    showToast('解析完成');
  } catch (error) {
    showToast(error.message);
    $('site-hint').textContent = error.message;
  } finally {
    setBusy(false);
  }
}

async function apply() {
  if (state.busy) return;
  let data;
  try {
    data = payload();
  } catch (error) {
    showToast(error.message);
    return;
  }
  if (!window.confirm(`将抓取网页并写入 Solr\n\n链接：${data.url}\nCore：${data.core}\n\n确认开始？`)) {
    return;
  }
  setBusy(true, '正在抓取并写入…');
  try {
    const result = await api('/api/admin/site/apply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    renderSummary(result, true);
    $('site-hint').textContent = '抓取完成；只写入主帖正文和 Core 支持的字段。';
    showToast('站点内容已写入');
  } catch (error) {
    showToast(error.message);
    $('site-hint').textContent = error.message;
  } finally {
    setBusy(false);
  }
}

$('site-inspect').addEventListener('click', () => void inspect());
$('site-apply').addEventListener('click', () => void apply());
void loadOptions();
