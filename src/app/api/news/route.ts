import { NextResponse } from 'next/server';
import axios, { AxiosError } from 'axios';
import OpenAI from 'openai';
import {
  SELECT_TOP_STORIES_PROMPT,
  REWRITE_SUMMARIZE_PROMPT,
} from '../../lib/prompt';

const API_KEY = process.env.MEDIASTACK_API_KEY;
const BASE_URL = 'http://api.mediastack.com/v1/news';
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({ apiKey: OPENAI_KEY });

let cachedRawNews: RawArticle[] | null = null;
let lastFetchedTime: number = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000;

interface RawArticle {
  author: string | null;
  title: string | null;
  description: string | null;
  url: string | null;
  url_to_image: string | null;
  published_at: string | null;
  content: string | null;
  source: {
    name: string | null;
    url: string | null;
  };
  category: string | null;
  language: string | null;
  country: string | null;
}

interface TruncatedArticle {
  title: string | null;
  summary: string[] | null;
  url: string | null;
}

interface ArticleWithSummary extends TruncatedArticle {
  summary: string[];
}

function checkCache() {
  const now = Date.now();
  const cacheAge = now - lastFetchedTime;
  const cacheValid = cachedRawNews !== null && cacheAge < CACHE_DURATION;

  return cacheValid;
}

function truncateArticleContent(article: RawArticle): TruncatedArticle {
  return {
    title: article.title,
    summary: article.description ? [article.description] : null,
    url: article.url,
  };
}

async function getFilteredTopStories(
  articles: TruncatedArticle[]
): Promise<TruncatedArticle[]> {
  const prompt = SELECT_TOP_STORIES_PROMPT(articles);

  console.log('Filtering the top news stories...');

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
    });

    const aiResponse = completion.choices[0].message.content ?? '';
    const parsedResponse = JSON.parse(aiResponse);

    const topStories: TruncatedArticle[] =
      parsedResponse.topStories || parsedResponse;
    return topStories;
  } catch (error) {
    console.error('Error filtering top stories:', error);
    return [];
  }
}

async function getSummaryFromAI(
  articles: TruncatedArticle[]
): Promise<ArticleWithSummary[]> {
  console.log('Summarising the top news stories...');
  const summaries: ArticleWithSummary[] = [];

  if (!Array.isArray(articles)) {
    console.error('Articles is not an array:', articles);
    return [];
  }

  for (const article of articles) {
    if (!article) continue;

    try {
      const prompt = REWRITE_SUMMARIZE_PROMPT(article);

      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
      });

      const aiResponse = completion.choices[0].message.content ?? '';

      try {
        const parsedResponse = JSON.parse(aiResponse);
        summaries.push({
          ...article,
          title: parsedResponse.title || article.title,
          summary: Array.isArray(parsedResponse.summary)
            ? parsedResponse.summary
            : [parsedResponse.summary || 'No summary available'],
        });
      } catch (parseError) {
        console.error('Error parsing AI response:', parseError);
        summaries.push({
          ...article,
          summary: ['Failed to generate summary'],
        });
      }
    } catch (error) {
      console.error('Error summarizing article:', error);
      summaries.push({ ...article, summary: ['Summary not available'] });
    }
  }

  return summaries;
}

export async function GET() {
  const now = Date.now();

  // Use cached raw news if available
  if (checkCache() && cachedRawNews) {
    console.log('Using cached raw news, but processing with AI 📰');
    const filteredArticles = await getFilteredTopStories(
      cachedRawNews.map(truncateArticleContent)
    );
    const summarizedArticles = await getSummaryFromAI(filteredArticles);
    return NextResponse.json(summarizedArticles);
  }

  try {
    console.log('Fetching fresh news from Australia 🌍');

    const includedCategories = 'general,business,health,science,technology';
    const excludedKeywords =
      'football,soccer,cricket,rugby,basketball,nba,a-league,grand final,athlete,team,match,celebrity,actor,singer,movie,tv show,album,gossip,film,music,entertainment,lifestyle,fashion,travel,food,recipe,local news,shop,store,sport,game,league,club,player,coach,stadium,arena,score,win,lose,defeat,cup,championship,final,draft,trade';
    const includedSources = 'abc-au,crikey,the-age';

    const response = await axios.get(BASE_URL, {
      params: {
        access_key: API_KEY,
        countries: 'au',
        languages: 'en',
        limit: 100,
        sources: includedSources,
        categories: includedCategories,
        keywords: `-${excludedKeywords.split(',').join(',-')}`,
      },
    });

    console.log(
      `Received ${
        response.data.data?.length || 0
      } articles from the specified sources`
    );

    if (!response.data.data || !Array.isArray(response.data.data)) {
      console.error('Invalid API response structure:', response.data);
      return NextResponse.json(
        { error: 'Invalid API response structure' },
        { status: 500 }
      );
    }

    const rawArticles: RawArticle[] = response.data.data;
    cachedRawNews = rawArticles;
    lastFetchedTime = now;

    const filteredArticles = await getFilteredTopStories(
      rawArticles.map(truncateArticleContent)
    );
    const summarizedArticles = await getSummaryFromAI(filteredArticles);

    return NextResponse.json(summarizedArticles);
  } catch (error: any) {
    console.error('Error fetching or processing news:', error);
    if (error.response?.status === 429) {
      return NextResponse.json(
        {
          error:
            'Too Many Requests - You have exceeded the MediaStack API rate limit. Please try again later.',
        },
        { status: 429 }
      );
    } else if (error instanceof AxiosError) {
      return NextResponse.json(
        {
          error: `Failed to fetch news from MediaStack: ${
            error.message
          } (Status: ${error.response?.status || 'unknown'})`,
        },
        { status: error.response?.status || 500 }
      );
    } else {
      return NextResponse.json(
        { error: `Failed to fetch news: ${error}` },
        { status: 500 }
      );
    }
  }
}
