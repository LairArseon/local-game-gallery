export const F95_GAMES_RSS_URL = 'https://f95zone.to/sam/latest_alpha/latest_data.php?cmd=rss&cat=games';

export type F95FeedTitleParts = {
  label: string | null;
  gameName: string;
  versionLabel: string | null;
};

export type F95RssItem = {
  title: string;
  rawTitle: string;
  label: string | null;
  versionLabel: string | null;
  threadId: string | null;
  threadUrl: string;
  guid: string;
  creator: string;
  author: string;
  publishedAt: string;
  previewImageUrl: string | null;
  descriptionHtml: string;
};

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripCdata(value: string) {
  return value.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

function readTag(block: string, tagName: string) {
  const expression = new RegExp(`<${tagName}>([\\s\\S]*?)<\/${tagName}>`, 'i');
  const match = block.match(expression);
  return match ? decodeXmlEntities(stripCdata(match[1])) : '';
}

function readPreviewImageUrl(descriptionHtml: string) {
  const imageMatch = descriptionHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
  return imageMatch?.[1] ?? null;
}

export function parseF95FeedTitle(rawTitle: string): F95FeedTitleParts {
  const normalizedTitle = String(rawTitle ?? '').trim();
  const labelMatch = normalizedTitle.match(/^\[(.+?)\]\s*/);
  const label = labelMatch?.[1]?.trim() ?? null;
  const titleWithoutLabel = labelMatch ? normalizedTitle.slice(labelMatch[0].length).trim() : normalizedTitle;
  const versionMatch = titleWithoutLabel.match(/\[(.+?)\]\s*$/);
  const versionLabel = versionMatch?.[1]?.trim() ?? null;
  const gameName = versionMatch
    ? titleWithoutLabel.slice(0, titleWithoutLabel.length - versionMatch[0].length).trim()
    : titleWithoutLabel;

  return {
    label,
    gameName,
    versionLabel,
  };
}

export function extractF95ThreadId(value: string) {
  const match = String(value ?? '').match(/\/threads\/(\d+)(?:[/?#]|$)/i);
  return match?.[1] ?? null;
}

export function parseF95GamesRss(rssXml: string): F95RssItem[] {
  const source = String(rssXml ?? '').trim();
  if (!source) {
    return [];
  }

  const itemMatches = source.match(/<item>([\s\S]*?)<\/item>/gi) ?? [];
  return itemMatches.map((itemBlock) => {
    const rawTitle = readTag(itemBlock, 'title');
    const titleParts = parseF95FeedTitle(rawTitle);
    const threadUrl = readTag(itemBlock, 'link') || readTag(itemBlock, 'guid');
    const descriptionHtml = readTag(itemBlock, 'description');

    return {
      title: titleParts.gameName,
      rawTitle,
      label: titleParts.label,
      versionLabel: titleParts.versionLabel,
      threadId: extractF95ThreadId(threadUrl),
      threadUrl,
      guid: readTag(itemBlock, 'guid'),
      creator: readTag(itemBlock, 'dc:creator'),
      author: readTag(itemBlock, 'author'),
      publishedAt: readTag(itemBlock, 'pubDate'),
      previewImageUrl: readPreviewImageUrl(descriptionHtml),
      descriptionHtml,
    };
  }).filter((item) => item.threadUrl || item.rawTitle);
}