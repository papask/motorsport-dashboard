import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  articleText, copiedSentences, feedArticles, feedTime, feedLink, mergeStories, newsHeadline, newsPostText, parseFeed,
  robotsAllows, sentenceCap, summaryCap, type NewsItem,
} from '../src/services/newsService';

test('a split never leaves the guide page line behind its address', () => {
  const guide = '바레인 그랑프리 (말레이시아) 가이드 페이지\nhttps://www.onthelimit.app/next/16';
  // pad the summary so the post breaks right around the guide lines
  for (let pad = 300; pad <= 420; pad += 4) {
    const text = newsPostText('https://a.test/1', '제목', ['가'.repeat(pad) + '.'], guide);
    const posts = packPosts(textUnits(text));
    const label = posts.findIndex((p) => p.includes('가이드 페이지'));
    assert.ok(posts[label].includes('https://www.onthelimit.app/next/16'), `pad ${pad}: label and link split`);
  }
  // a link after a blank line is its own paragraph and may start a reply
  assert.deepEqual(textUnits('글\n\nhttps://a.test'), [['글', '\n'], ['https://a.test', '\n\n']]);
});

test('feed dates in British and Australian zones are read, not just GMT and US ones', () => {
  assert.equal(new Date(feedTime('Tue, 29 Sep 2026 12:00:00 BST')).toISOString(), '2026-09-29T11:00:00.000Z'); // Sky
  assert.equal(new Date(feedTime('Tue, 29 Sep 2026 20:00:00 AEST')).toISOString(), '2026-09-29T10:00:00.000Z');
  assert.equal(new Date(feedTime('Tue, 29 Sep 2026 11:00:06 GMT')).toISOString(), '2026-09-29T11:00:06.000Z'); // BBC
  assert.equal(new Date(feedTime('Tue, 29 Sep 2026 15:23:08 +0000')).toISOString(), '2026-09-29T15:23:08.000Z');
  assert.equal(new Date(feedTime('2026-09-29T08:00:00Z')).toISOString(), '2026-09-29T08:00:00.000Z'); // dc:date
  assert.ok(Number.isNaN(feedTime('')));
});

test('longer articles allow longer summaries: 3, 4, then 5 sentences', () => {
  assert.deepEqual([120, 400, 401, 1000, 1001, 3000].map(sentenceCap), [3, 3, 4, 4, 5, 5]);
  const words = (n: number) => Array(n).fill('word').join(' ');
  assert.equal(summaryCap(1500, words(2000)), 5); // the model's count of the body decides...
  assert.equal(summaryCap(1500, words(350)), 3); // ...but never above the text it read
  assert.equal(summaryCap(0, words(700)), 4); // no count from the model: the text alone
});

test('betting pieces are never collected; "against the odds" still is', () => {
  const now = Date.parse('2026-09-29T12:00:00Z');
  const item = (title: string, path: string) =>
    `<item><title>${title}</title><link>https://f1.test/${path}</link><pubDate>${new Date(now - 3600e3).toUTCString()}</pubDate></item>`;
  const xml = item('The 5 drivers most likely to win the Bahrain GP', 'the-5-drivers-according-to-betting-markets')
    + item('Bahrain GP race betting guide and latest odds', 'race-betting-guide')
    + item('How Hadjar won against the odds in Baku', 'hadjar-against-the-odds');
  assert.deepEqual(feedArticles(parseFeed(xml), false, now).map((a) => a.title), ['How Hadjar won against the odds in Baku']);
});

test("robots.txt: Anthropic's own group decides, else the catch-all one", () => {
  const bbc = 'User-agent: *\nDisallow: /cbeebies\n\nUser-agent: ClaudeBot\nUser-agent: anthropic-ai\nDisallow: /\n';
  assert.equal(robotsAllows(bbc, '/sport/formula1/articles/x'), false); // AI turned away outright
  const plain = 'User-agent: *\nDisallow: /videos/embed/\nDisallow: /search?q=*\n';
  assert.equal(robotsAllows(plain, '/f1/news/some-story/10860093/'), true);
  assert.equal(robotsAllows(plain, '/videos/embed/1'), false);
  assert.equal(robotsAllows(plain, '/search?q=verstappen'), false);
  // the longer pattern wins, Allow on a tie; an empty Disallow allows all
  assert.equal(robotsAllows('User-agent: Claude-User\nDisallow: /news\nAllow: /news/f1', '/news/f1/a'), true);
  assert.equal(robotsAllows('User-agent: claudebot\nDisallow:', '/anything'), true);
  assert.equal(robotsAllows('', '/anything'), true); // no robots.txt at all
});

test('an article page comes out as its paragraphs, nav and scripts left behind', () => {
  const html = `<nav><p>Subscribe to our newsletter for the latest F1 news today now</p></nav>
    <article><h1>Title</h1><p>Short byline</p>
    <p>Max Verstappen said &amp; the team <a href="/x">agreed</a> that Baku was a turning point.</p>
    <script>var p = "<p>not text at all, just a script string inside the page</p>";</script>
    <p>Red Bull will bring   another upgrade to Malaysia, the team confirmed on Tuesday.</p></article>`;
  assert.equal(articleText(html),
    'Max Verstappen said & the team agreed that Baku was a turning point.\n\n' +
    'Red Bull will bring another upgrade to Malaysia, the team confirmed on Tuesday.');
});

test('the guide page follows the source link, a blank line between, when there is one', () => {
  const guide = '바레인 그랑프리 (말레이시아) 가이드 페이지\nhttps://www.onthelimit.app/next/16';
  assert.equal(
    newsPostText('https://a.test/1', '제목', ['문장.'], guide),
    `제목\n\n• 문장.\n\n🔗 원문(AI 요약) https://a.test/1\n\n${guide}`,
  );
  assert.ok(!newsPostText('https://a.test/1', '제목', ['문장.']).includes('가이드'));
  assert.equal(gpNameKo('Bahrain Grand Prix in Malaysia'), '바레인 그랑프리 (말레이시아)');
});

test('a rumour headline carries [루머] exactly once', () => {
  assert.equal(newsHeadline('해밀턴, 2027 은퇴설', true), '[루머] 해밀턴, 2027 은퇴설');
  assert.equal(newsHeadline('[루머] 해밀턴, 2027 은퇴설', true), '[루머] 해밀턴, 2027 은퇴설');
  assert.equal(newsHeadline(' [루머]해밀턴, 2027 은퇴설', false), '해밀턴, 2027 은퇴설');
  assert.equal(newsHeadline('알론소 재계약 확정', false), '알론소 재계약 확정');
});

test('old articles never count as new; a first read keeps only the newest few', () => {
  const now = Date.parse('2026-09-29T12:00:00Z');
  const xml = ['2026-09-29T10:00:00Z', '2026-09-29T08:00:00Z', '2026-09-28T20:00:00Z', '2026-09-28T18:00:00Z', '2025-10-22T09:00:00Z']
    .map((d, i) => `<item><title>t${i}</title><link>https://feed.test/a${i}</link><pubDate>${new Date(d).toUTCString()}</pubDate></item>`)
    .join('') + '<item><title>undated</title><link>https://feed.test/u</link></item>';
  const status = (firstRead: boolean) => feedArticles(parseFeed(xml), firstRead, now).map((a) => `${a.url.slice(-2)} ${a.status}`);
  // the year-old one is dropped either way; the undated one is judged by the seen list alone
  assert.deepEqual(status(false), ['a0 new', 'a1 new', 'a2 new', 'a3 new', '/u new']);
  assert.deepEqual(status(true), ['a0 new', 'a1 new', 'a2 new', 'a3 dismissed', '/u dismissed']);
});

test('repeats of one story fold into the article that listed it first', () => {
  const item = (url: string): NewsItem => ({ url, title: url, found: '', status: 'new' });
  const recent = [item('f1/alonso'), item('f1/russell')];
  const fresh = [item('race/alonso'), item('race/ferrari'), item('fans/ferrari'), item('fans/alonso'), item('fans/other')];
  const kept = mergeStories(fresh, recent, {
    n0: 'r0', // same as a listed story
    n1: '', // a new story...
    n2: 'n1', // ...another outlet's take on it, listed in the same check
    n3: 'n0', // points at a merged article: lands on that article's story
    n4: 'n9', // an id that isn't above it is ignored
  });
  assert.deepEqual(kept.map((i) => i.url), ['race/ferrari', 'fans/other']);
  assert.deepEqual(recent[0].also?.map((a) => a.url), ['race/alonso', 'fans/alonso']);
  assert.deepEqual(fresh[1].also?.map((a) => a.url), ['fans/ferrari']);
  assert.equal(recent[1].also, undefined);
});

test('a site page leads to the RSS feed it advertises', () => {
  const html = `<head><link rel="stylesheet" href="/a.css">
    <link rel="alternate" type="application/atom+xml" href="/atom">
    <link type="application/rss+xml" rel="alternate" title="F1 &amp; more" href="/feed/?cat=f1&amp;x=1"></head>`;
  assert.equal(feedLink(html, 'https://news.example/f1/'), 'https://news.example/feed/?cat=f1&x=1');
  assert.equal(feedLink('<link rel="stylesheet" href="/a.css">', 'https://news.example/'), undefined);
});

test('feed items come out as title and link, CDATA and entities decoded', () => {
  const xml = `<rss><channel><title>Feed</title><link>https://site</link>
    <item><title><![CDATA[Alonso & Aston: "why"]]></title><link>https://a.com/1?x=1&amp;y=2</link></item>
    <item><title>Norris&#8217;s &#x2018;win&#x2019;</title>
      <link> https://a.com/2 </link><guid isPermaLink="true">https://a.com/2</guid></item>
    <item><title>no link</title></item>
  </channel></rss>`;
  assert.deepEqual(parseFeed(xml), [
    { title: 'Alonso & Aston: "why"', url: 'https://a.com/1?x=1&y=2' },
    { title: 'Norris’s ‘win’', url: 'https://a.com/2' },
  ]);
});
import { gpNameKo, packPosts, textUnits } from '../src/services/threadsService';

test('a sentence lifted from the article is flagged, a paraphrase is not', () => {
  const source = '맥라렌은 다음 시즌에도 두 드라이버와 함께한다고 공식 발표했다. 계약은 2028년까지다.';
  const copied = '맥라렌은 다음 시즌에도 두 드라이버와 함께한다고 공식 발표했다.';
  const own = '맥라렌이 현 드라이버 라인업을 2028년까지 유지하기로 했습니다.';
  assert.deepEqual(copiedSentences([copied, own], source), [copied]);
});

test('a draft keeps its lines and blank lines when packed into posts', () => {
  const text = newsPostText('https://example.com/a', '제목', ['첫 문장.', '둘째 문장.']);
  assert.deepEqual(packPosts(textUnits(text)), [text]);
  assert.deepEqual(packPosts(textUnits('  a  \n\n\n b \nc')), ['a\n\nb\nc']);
});

test('a long draft splits between sentences, even inside one line', () => {
  const sentences = Array.from({ length: 12 }, (_, i) => `${i}번 문장 `.padEnd(80, '가') + '.');
  // two sentences per bullet line
  const lines = Array.from({ length: 6 }, (_, i) => `• ${sentences[2 * i]} ${sentences[2 * i + 1]}`);
  const posts = packPosts(textUnits(lines.join('\n')));
  assert.ok(posts.length > 1);
  for (const s of sentences) assert.ok(posts.some((p) => p.includes(s)), s);
  // at least one reply opens with a line's second sentence, i.e. mid-line
  assert.ok(posts.slice(1).some((p) => !p.startsWith('•')));
});
