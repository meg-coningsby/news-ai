import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import axios, { AxiosError } from 'axios';
import OpenAI from 'openai';

import {
  SELECT_TOP_STORIES_PROMPT,
  REWRITE_SUMMARIZE_PROMPT,
  SELECT_UPLIFTING_STORIES_PROMPT,
  REWRITE_UPLIFTING_PROMPT,
} from '../../../lib/prompt';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const GENERAL_NEWS_REDIS_KEY = 'todays_general_news';
const UPLIFTING_NEWS_REDIS_KEY = 'todays_uplifting_news';

const MEDIASTACK_BASE_URL = 'http://api.mediastack.com/v1/news';
const REDDIT_API_BASE_URL = 'https://oauth.reddit.com';
const UPLIFTING_NEWS_SUBREDDIT = 'r/upliftingnews/top';

// --- For General News (from MediaStack) ---
interface GeneralNewsRawArticle {
  author: string | null;
  title: string | null;
  description: string | null;
  url: string | null;
  image: string | null;
  published_at: string | null;
  content: string | null;
  source: string | null;
  category: string | null;
  language: string | null;
  country: string | null;
}

interface GeneralNewsTruncatedArticle {
  title: string | null;
  summary: string[] | null;
  url: string | null;
  image?: string | null;
  sourceName?: string | null;
  published_at?: string | null;
}

interface GeneralNewsArticleWithSummary extends GeneralNewsTruncatedArticle {
  summary: string[];
}

// --- For Uplifting News (from Reddit) ---
interface UpliftingNewsRawArticle {
  title: string;
  url: string;
  source: string;
  description: string;
  reddit_data: any;
}

interface UpliftingNewsArticleWithSummary {
  title: string;
  url: string;
  source: string;
  summary: string[];
}

// --- Functions for General News (MediaStack) ---

async function fetchGeneralNewsFromApi(
  apiKey: string,
  sourcesQuery: string,
  categoriesQuery: string,
  keywordsQuery: string,
  retryCount: number = 0,
  maxRetries: number = 3
): Promise<GeneralNewsRawArticle[]> {
  const params: Record<string, any> = {
    access_key: apiKey,
    countries: 'au',
    languages: 'en',
    limit: 50,
  };
  if (sourcesQuery) params.sources = sourcesQuery;
  if (categoriesQuery) params.categories = categoriesQuery;
  if (keywordsQuery) params.keywords = keywordsQuery;

  try {
    const response = await axios.get(MEDIASTACK_BASE_URL, { params });
    if (response.data && Array.isArray(response.data.data)) {
      return response.data.data as GeneralNewsRawArticle[];
    }
    return [];
  } catch (error: any) {
    const axiosError = error as AxiosError;
    console.error(
      `Error fetching from MediaStack API (attempt ${retryCount + 1}):`,
      axiosError.message
    );
    if (axiosError.response?.status === 429 && retryCount < maxRetries) {
      const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchGeneralNewsFromApi(
        apiKey,
        sourcesQuery,
        categoriesQuery,
        keywordsQuery,
        retryCount + 1,
        maxRetries
      );
    }
    throw axiosError;
  }
}

function truncateGeneralNewsArticle(
  article: GeneralNewsRawArticle
): GeneralNewsTruncatedArticle {
  return {
    title: article.title,
    summary: article.description ? [article.description] : null,
    url: article.url,
    image: article.image,
    sourceName: article.source,
    published_at: article.published_at,
  };
}

async function filterGeneralNews(
  articles: GeneralNewsTruncatedArticle[]
): Promise<GeneralNewsTruncatedArticle[]> {
  if (!articles || articles.length === 0) return [];
  const prompt = SELECT_TOP_STORIES_PROMPT(articles);
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
    });
    const aiResponse = completion.choices[0].message.content ?? '';
    const parsedResponse = JSON.parse(aiResponse);
    return (
      parsedResponse.topStories ||
      (Array.isArray(parsedResponse) ? parsedResponse : [])
    );
  } catch (error) {
    console.error('Error filtering general news stories:', error);
    return articles.slice(0, 5); // Fallback
  }
}

async function summarizeGeneralNews(
  articles: GeneralNewsTruncatedArticle[]
): Promise<GeneralNewsArticleWithSummary[]> {
  if (!articles || articles.length === 0) return [];

  const summaryPromises = articles.map((article) => {
    if (!article || !article.title)
      return Promise.resolve({
        ...article,
        summary: ['Skipped due to missing data'],
      });

    const prompt = REWRITE_SUMMARIZE_PROMPT(article);
    return openai.chat.completions
      .create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
      })
      .then((completion) => {
        const aiResponse = completion.choices[0].message.content ?? '';
        const parsedResponse = JSON.parse(aiResponse);
        return {
          ...article,
          title: parsedResponse.title || article.title,
          summary:
            Array.isArray(parsedResponse.summary) &&
            parsedResponse.summary.length > 0
              ? parsedResponse.summary
              : article.summary || ['No summary available'],
        };
      })
      .catch((error) => {
        console.error(
          `Error summarizing general news article "${article.title}":`,
          error
        );
        return {
          ...article,
          summary: article.summary || ['Summary not available due to error'],
        };
      });
  });

  return Promise.all(summaryPromises);
}

// --- Functions for Uplifting News (Reddit) ---

async function getRedditAccessToken(): Promise<string> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME;
  const password = process.env.REDDIT_PASSWORD;
  if (!clientId || !clientSecret || !username || !password)
    throw new Error('Reddit API credentials missing');

  const authString = Buffer.from(`${clientId}:${clientSecret}`).toString(
    'base64'
  );
  const response = await axios.post(
    'https://www.reddit.com/api/v1/access_token',
    `grant_type=password&username=${encodeURIComponent(
      username
    )}&password=${encodeURIComponent(password)}`,
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authString}`,
        'User-Agent': 'news-ai-chi/0.1.0 by /u/bsidesister',
      },
    }
  );
  return response.data.access_token;
}

async function fetchUpliftingNewsFromApi(
  accessToken: string
): Promise<UpliftingNewsRawArticle[] | { error: string }> {
  try {
    const response = await axios.get(
      `${REDDIT_API_BASE_URL}/${UPLIFTING_NEWS_SUBREDDIT}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'news-ai-chi/0.1.0 by /u/bsidesister',
        },
        params: { limit: 50, t: 'day' },
      }
    );
    if (
      !response.data?.data?.children ||
      !Array.isArray(response.data.data.children)
    )
      return { error: 'Invalid Reddit API response structure' };
    return response.data.data.children.map((child: any) => ({
      title: child.data.title,
      url: child.data.url,
      source: child.data.subreddit_name_prefixed,
      description: child.data.selftext,
      reddit_data: child.data,
    }));
  } catch (error: any) {
    return { error: `Failed to fetch from Reddit API: ${error.message}` };
  }
}

async function filterUpliftingNews(
  articles: UpliftingNewsRawArticle[]
): Promise<UpliftingNewsRawArticle[]> {
  if (!articles || articles.length === 0) return [];
  const truncatedArticles = articles.map((article) => ({
    title: article.title,
    summary: article.description,
    url: article.url,
  }));
  const prompt = SELECT_UPLIFTING_STORIES_PROMPT(truncatedArticles);
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
    });
    const aiResponse = completion.choices[0].message.content ?? '';
    const parsedResponse = JSON.parse(aiResponse);
    const topStoriesInfo: { url: string }[] =
      parsedResponse.topStories || parsedResponse;
    const topUrls = new Set(topStoriesInfo.map((story) => story.url));
    return articles.filter((article) => topUrls.has(article.url));
  } catch (error) {
    console.error('Error filtering uplifting news stories:', error);
    return [];
  }
}

async function summarizeUpliftingNews(
  articles: UpliftingNewsRawArticle[]
): Promise<UpliftingNewsArticleWithSummary[]> {
  if (!articles || articles.length === 0) return [];

  const summaryPromises = articles.map((article) => {
    const prompt = REWRITE_UPLIFTING_PROMPT({ title: article.title });
    return openai.chat.completions
      .create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
      })
      .then((completion) => {
        const aiResponse = completion.choices[0].message.content ?? '';
        const parsedResponse = JSON.parse(aiResponse);
        return {
          title: parsedResponse.title || article.title,
          url: article.url,
          source: article.source,
          summary: [parsedResponse.title || article.title],
        };
      })
      .catch((error) => {
        console.error(
          `Error rewriting uplifting headline for "${article.title}":`,
          error
        );
        return {
          title: article.title,
          url: article.url,
          source: article.source,
          summary: [article.title],
        };
      });
  });

  return Promise.all(summaryPromises);
}

export async function GET() {
  console.log('CRON JOB STARTED: Starting daily news processing.');
  try {
    console.log('CRON: --- Processing General News (MediaStack) ---');
    const apiKey = process.env.MEDIASTACK_API_KEY;
    if (!apiKey) throw new Error('MEDIASTACK_API_KEY is not set.');

    const includedCategories = 'general,business,health,science,technology';
    const excludedKeywordsList =
      'football,soccer,cricket,rugby,basketball,nba,a-league,grand final,celebrity,actor,singer,movie,tv show,gossip,entertainment,lifestyle,fashion,travel,food,recipe,local news,shop,store,sport,game,league,club,player,coach,score,win,lose,final';
    const includedSources = 'abc-news-au,crikey,the-age';
    const keywordsApiFilter = excludedKeywordsList
      .split(',')
      .map((k) => `-${k.trim()}`)
      .join(',');

    const rawGeneralArticles = await fetchGeneralNewsFromApi(
      apiKey,
      includedSources,
      includedCategories,
      keywordsApiFilter
    );
    console.log(
      `CRON: Fetched ${rawGeneralArticles.length} raw articles from MediaStack.`
    );

    if (rawGeneralArticles.length > 0) {
      const truncatedGeneralArticles = rawGeneralArticles.map(
        truncateGeneralNewsArticle
      );
      const filteredGeneralArticles = await filterGeneralNews(
        truncatedGeneralArticles
      );
      console.log(
        `CRON: Filtered down to ${filteredGeneralArticles.length} general articles.`
      );

      const finalGeneralArticles = await summarizeGeneralNews(
        filteredGeneralArticles
      );
      console.log(
        `CRON: Summarized ${finalGeneralArticles.length} general articles.`
      );

      await kv.set(GENERAL_NEWS_REDIS_KEY, finalGeneralArticles);
      console.log(
        `CRON: Successfully stored ${finalGeneralArticles.length} general news articles in Redis.`
      );
    }

    console.log('CRON: --- Processing Uplifting News (Reddit) ---');
    const accessToken = await getRedditAccessToken();
    const rawUpliftingArticlesResult = await fetchUpliftingNewsFromApi(
      accessToken
    );

    if ('error' in rawUpliftingArticlesResult) {
      throw new Error(rawUpliftingArticlesResult.error);
    }
    console.log(
      `CRON: Fetched ${rawUpliftingArticlesResult.length} raw articles from Reddit.`
    );

    if (rawUpliftingArticlesResult.length > 0) {
      const filteredUpliftingArticles = await filterUpliftingNews(
        rawUpliftingArticlesResult
      );
      console.log(
        `CRON: Filtered down to ${filteredUpliftingArticles.length} uplifting articles.`
      );

      const finalUpliftingArticles = await summarizeUpliftingNews(
        filteredUpliftingArticles
      );
      console.log(
        `CRON: Rewrote headlines for ${finalUpliftingArticles.length} uplifting articles.`
      );

      await kv.set(UPLIFTING_NEWS_REDIS_KEY, finalUpliftingArticles);
      console.log(
        `CRON: Successfully stored ${finalUpliftingArticles.length} uplifting news articles in Redis.`
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Daily news processing completed successfully.',
    });
  } catch (error: any) {
    console.error('CRON JOB FAILED:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  } finally {
    console.log('CRON JOB FINISHED.');
  }
}
