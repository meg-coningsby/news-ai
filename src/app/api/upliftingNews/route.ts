import { NextResponse } from 'next/server';
import axios from 'axios';
import OpenAI from 'openai';
import {
  SELECT_UPLIFTING_STORIES_PROMPT,
  REWRITE_UPLIFTING_PROMPT,
} from '../../lib/prompt';

const REDDIT_API_BASE_URL = 'https://oauth.reddit.com';
const UPLIFTING_NEWS_SUBREDDIT = 'r/upliftingnews/top';

async function getAccessToken() {
  console.log('Attempting to get Reddit API access token...');
  try {
    const clientId = process.env.REDDIT_CLIENT_ID;
    const clientSecret = process.env.REDDIT_CLIENT_SECRET;
    const username = process.env.REDDIT_USERNAME;
    const password = process.env.REDDIT_PASSWORD;

    if (!clientId || !clientSecret || !username || !password) {
      console.error(
        'Error: Reddit API credentials (client ID, secret, username, or password) are not set in the environment variables.'
      );
      throw new Error('Reddit API credentials missing');
    }

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

    console.log('Reddit API access token response:', response.data);
    return response.data.access_token;
  } catch (error) {
    console.error('Error getting access token:', error);
    throw error;
  }
}

const OPENAI_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({ apiKey: OPENAI_KEY });

let cachedRedditNews: any = null;
let lastFetchedTime: number = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000;

function checkCache() {
  const now = Date.now();
  const cacheAge = now - lastFetchedTime;
  const cacheValid = cachedRedditNews && cacheAge < CACHE_DURATION;

  return cacheValid;
}

function truncateArticleContent(article: any) {
  return {
    title: article.title,
    summary: article.description, // Adjust if needed after inspecting Reddit data
    url: article.url,
  };
}

async function getFilteredTopStories(articles: any[]) {
  const truncatedArticles = articles.map(truncateArticleContent);

  const prompt = SELECT_UPLIFTING_STORIES_PROMPT(truncatedArticles);

  console.log('Filtering the top uplifting news stories...');

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
    });

    const aiResponse = completion.choices[0].message.content ?? '';
    const parsedResponse = JSON.parse(aiResponse);

    const topStories = parsedResponse.topStories || parsedResponse;
    return topStories;
  } catch (error) {
    console.error('Error filtering top uplifting news stories:', error);
    return [];
  }
}

async function getSummaryFromAI(articles: any) {
  console.log('Rewriting the headlines of the top uplifting news stories...');
  const rewrittenArticles = [];

  if (!Array.isArray(articles)) {
    console.error('Articles is not an array:', articles);
    return [];
  }

  for (const article of articles) {
    try {
      const prompt = REWRITE_UPLIFTING_PROMPT(article);

      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
      });

      const aiResponse = completion.choices[0].message.content ?? '';

      try {
        const parsedResponse = JSON.parse(aiResponse);
        rewrittenArticles.push({
          ...article,
          title: parsedResponse.title || article.title,
          summary: [parsedResponse.title || article.title],
        });
      } catch (parseError) {
        console.error(
          'Error parsing AI response for headline rewrite:',
          parseError,
          aiResponse
        );
        rewrittenArticles.push({
          ...article,
          summary: [article.title],
        });
      }
    } catch (error) {
      console.error('Error rewriting headline:', error);
      rewrittenArticles.push({ ...article, summary: [article.title] });
    }
  }

  return rewrittenArticles;
}

async function getTopUpliftingNews(accessToken: string) {
  console.log('Fetching fresh news from Uplifting News via Reddit API...');
  try {
    const response = await axios.get(
      `${REDDIT_API_BASE_URL}/${UPLIFTING_NEWS_SUBREDDIT}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'news-ai-chi/0.1.0 by /u/bsidesister',
        },
        params: {
          limit: 50,
          t: 'day',
        },
      }
    );

    if (
      !response.data?.data?.children ||
      !Array.isArray(response.data.data.children)
    ) {
      console.error('Invalid API response structure:', response.data);
      return { error: 'Invalid API response structure' };
    }

    const articles = response.data.data.children.map(
      (child: {
        data: {
          title: any;
          url: any;
          subreddit_name_prefixed: any;
          selftext: any;
        };
      }) => ({
        title: child.data.title,
        url: child.data.url,
        source: child.data.subreddit_name_prefixed,
        description: child.data.selftext, // Inspect this for actual content
        reddit_data: child.data,
      })
    );
    return articles;
  } catch (error: any) {
    console.error('Error fetching top news from Reddit API:', error);
    return {
      error: `Failed to fetch top news from Reddit API: ${error.message}`,
    };
  }
}

export async function GET() {
  const now = Date.now();

  // Use cached processed news if available
  if (checkCache()) {
    console.log('Using cached and processed uplifting news 📰');
    const summarizedArticles = await getSummaryFromAI(cachedRedditNews);
    return NextResponse.json(summarizedArticles);
  }

  try {
    const accessToken = await getAccessToken();
    const freshArticlesResult = await getTopUpliftingNews(accessToken);

    if (freshArticlesResult?.error) {
      console.error('Error fetching articles:', freshArticlesResult.error);
      return NextResponse.json(
        { error: freshArticlesResult.error },
        { status: 500 }
      );
    }

    const freshArticles = freshArticlesResult as any[];
    cachedRedditNews = freshArticles;
    lastFetchedTime = now;

    const filteredResult = await getFilteredTopStories(freshArticles);
    const articlesToSummarize =
      filteredResult?.upliftingStories || filteredResult || [];
    const summarizedArticles = await getSummaryFromAI(articlesToSummarize);

    return NextResponse.json(summarizedArticles);
  } catch (error: any) {
    console.error('Error in GET handler:', error);
    return NextResponse.json(
      { error: `Failed to fetch and process uplifting news: ${error.message}` },
      { status: 500 }
    );
  }
}
