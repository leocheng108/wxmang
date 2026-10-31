/**
 * 把 MHTML 解析结果映射成 Solr 字段。
 * value 只放适合页面展示的摘要；完整正文在 paragraphs/contentPreview 中。
 */
export function buildFieldMappings(doc) {
    return [
        {
            field: 'id',
            value: doc.id,
            source: 'ID 前缀 + sha1(相对路径) 的前 12 位',
        },
        {
            field: 'title',
            value: doc.title,
            source: 'article-title；缺失时用 <title>；再缺失用文件名',
        },
        {
            field: 'content',
            value: `${doc.paragraphCount} 段 / ${doc.text.length.toLocaleString()} 字符`,
            source: 'article-body 正文 → 按空行切段 → 包成 <p> 段落',
        },
        {
            field: 'userName',
            value: doc.author,
            source: 'course-title 中包含“吴军”或“蒋文华”时取作者，否则“未知”',
        },
        {
            field: 'writeTime',
            value: doc.publishTime,
            source: 'article-publish-time；缺失时用文件 mtime',
        },
        {
            field: 'parentId',
            value: '0',
            source: '固定值',
        },
        {
            field: 'tagName',
            value: doc.tagName,
            source: '页面/配置中的标签',
        },
        {
            field: 'url',
            value: doc.url || '（空）',
            source: 'HTML part 的 Content-Location；回退 Snapshot-Content-Location',
        },
        {
            field: 'fileName',
            value: doc.fileName,
            source: '源文件名',
        },
        {
            field: 'sourcePath',
            value: doc.sourcePath,
            source: '文件相对采集根目录的路径',
        },
        {
            field: 'course',
            value: doc.course || '（空）',
            source: 'article-info .course-title',
        },
        {
            field: 'lessonNo',
            value: doc.lessonNo || '（空）',
            source: '标题开头的数字（如 01｜...）',
        },
        {
            field: 'docType',
            value: doc.docType,
            source: '存在 article-body → 课程文章；否则网页归档',
        },
        {
            field: 'summary',
            value: doc.summary,
            source: '正文前 180 个字符',
        },
    ];
}
export function contentPreview(doc, maxChars = 6000) {
    return doc.text.slice(0, maxChars);
}
export function htmlPreview(doc, maxChars = 4000) {
    return doc.content.slice(0, maxChars);
}
export function paragraphs(doc, maxParagraphs = 20) {
    return doc.text
        .split(/\n{2,}/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, maxParagraphs);
}
export function buildSiteFieldMappings(doc) {
    const url = new URL(doc.url);
    return [
        {
            field: 'id',
            value: doc.id,
            source: 'ID 前缀 + sha1(规范化网页 URL) 的前 12 位',
        },
        {
            field: 'title',
            value: doc.title,
            source: '#topic-content h1；回退 h1 和 <title>',
        },
        {
            field: 'content',
            value: `${doc.paragraphCount} 段 / ${doc.text.length.toLocaleString()} 字符`,
            source: '#link-report .topic-content .rich-content 的段落 → <p>',
        },
        {
            field: 'userName',
            value: doc.author,
            source: '#topic-content .topic-doc .from a',
        },
        {
            field: 'writeTime',
            value: doc.publishTime,
            source: '.create-time → ISO 时间',
        },
        {
            field: 'parentId',
            value: doc.parentId,
            source: doc.parentId === '0' ? '固定值 0（主帖）' : '主帖 ID（回复）',
        },
        {
            field: 'tagName',
            value: doc.tagName,
            source: '页面采集标签',
        },
        {
            field: 'url',
            value: doc.url,
            source: '规范化后的页面 URL',
        },
        {
            field: 'docType',
            value: doc.docType,
            source: '主帖 / 回复',
        },
        {
            field: 'summary',
            value: doc.summary,
            source: '正文前 180 个字符',
        },
        {
            field: 'canonical_url',
            value: doc.url,
            source: '规范化 URL',
        },
        {
            field: 'site',
            value: url.hostname,
            source: 'URL hostname',
        },
        {
            field: 'host',
            value: url.host,
            source: 'URL host（含端口）',
        },
        {
            field: 'language',
            value: 'zh',
            source: '当前网页采集默认中文',
        },
        {
            field: 'fetched_at',
            value: '写入时生成',
            source: '本次抓取时间',
        },
        {
            field: 'quality_score',
            value: '1',
            source: '当前默认质量分',
        },
        {
            field: 'http_status',
            value: '200',
            source: '抓取 HTTP 状态',
        },
        {
            field: 'source_type',
            value: 'site',
            source: '固定值：站点采集',
        },
        {
            field: 'content_hash',
            value: '写入时计算',
            source: '内容 SHA-256，用于增量判断',
        },
    ];
}
//# sourceMappingURL=fieldMapping.js.map