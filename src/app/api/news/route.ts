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

if (!OPENAI_KEY) {
  console.error(
    'CRITICAL: OPENAI_API_KEY is not set. OpenAI features will fail.'
  );
}
const openai = new OpenAI({ apiKey: OPENAI_KEY });

let cachedRawNews: RawArticle[] | null = null;
let lastFetchedTime: number = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

interface RawArticle {
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

interface TruncatedArticle {
  title: string | null;
  summary: string[] | null;
  url: string | null;
  image?: string | null;
  sourceName?: string | null;
  published_at?: string | null;
}

interface ArticleWithSummary extends TruncatedArticle {
  summary: string[];
}

function checkCache(): boolean {
  const now = Date.now();
  const cacheAge = now - lastFetchedTime;
  return cachedRawNews !== null && cacheAge < CACHE_DURATION;
}

function truncateArticleContent(article: RawArticle): TruncatedArticle {
  return {
    title: article.title,
    summary: article.description ? [article.description] : null,
    url: article.url,
    image: article.image,
    sourceName: article.source,
    published_at: article.published_at,
  };
}

async function getFilteredTopStories(
  articles: TruncatedArticle[]
): Promise<TruncatedArticle[]> {
  if (!articles || articles.length === 0) {
    console.log('No articles provided to filter.');
    return [];
  }
  const prompt = SELECT_TOP_STORIES_PROMPT(articles);

  console.log('Filtering the top news stories with OpenAI...');

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
    });

    const aiResponse = completion.choices[0].message.content;
    if (!aiResponse) {
      console.error('OpenAI returned an empty response for filtering.');
      return [];
    }

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(aiResponse);
    } catch (parseError) {
      console.error(
        'Error parsing AI response for filtering (not valid JSON):',
        parseError,
        '\nAI Response:',
        aiResponse
      );
      return [];
    }

    const topStories: TruncatedArticle[] =
      parsedResponse.topStories ||
      (Array.isArray(parsedResponse) ? parsedResponse : []);

    if (!Array.isArray(topStories)) {
      console.error(
        'Parsed AI response for top stories is not an array:',
        topStories
      );
      return [];
    }

    return topStories;
  } catch (error) {
    console.error('Error filtering top stories with OpenAI:', error);
    return articles.slice(0, 5);
  }
}

async function getSummaryFromAI(
  articles: TruncatedArticle[]
): Promise<ArticleWithSummary[]> {
  if (!articles || articles.length === 0) {
    console.log('No articles provided for summarization.');
    return [];
  }
  console.log(`Summarising ${articles.length} top news stories with OpenAI...`);
  const summarizedArticles: ArticleWithSummary[] = [];

  for (const article of articles) {
    if (!article || !article.title) {
      console.warn('Skipping article due to missing data:', article);
      continue;
    }

    try {
      const prompt = REWRITE_SUMMARIZE_PROMPT(article);

      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
      });

      const aiResponse = completion.choices[0].message.content;
      if (!aiResponse) {
        console.error(
          `OpenAI returned an empty response for summarizing article: ${article.title}`
        );
        summarizedArticles.push({
          ...article,
          summary: ['Summary generation failed (empty AI response)'],
        });
        continue;
      }

      try {
        const parsedResponse = JSON.parse(aiResponse);
        summarizedArticles.push({
          ...article,
          title: parsedResponse.title || article.title,
          summary:
            Array.isArray(parsedResponse.summary) &&
            parsedResponse.summary.length > 0
              ? parsedResponse.summary
              : article.summary || ['No summary available'],
        });
      } catch (parseError) {
        console.error(
          `Error parsing AI summary response for article: ${article.title}`,
          parseError,
          '\nAI Response:',
          aiResponse
        );
        summarizedArticles.push({
          ...article,
          summary: article.summary || ['Failed to parse generated summary'],
        });
      }
    } catch (error) {
      console.error(
        `Error summarizing article "${article.title}" with OpenAI:`,
        error
      );
      summarizedArticles.push({
        ...article,
        summary: article.summary || ['Summary not available due to error'],
      });
    }
  }

  return summarizedArticles;
}

async function fetchNewsFromApi(
  apiKey: string,
  sourcesQuery: string,
  categoriesQuery: string,
  keywordsQuery: string,
  retryCount: number = 0,
  maxRetries: number = 3
): Promise<RawArticle[]> {
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
    console.log('Fetching from MediaStack with params:', params);
    const response = await axios.get(BASE_URL, { params });
    if (response.data && Array.isArray(response.data.data)) {
      return response.data.data as RawArticle[];
    } else {
      console.error(
        'Unexpected API response structure from MediaStack:',
        response.data
      );
      return [];
    }
  } catch (error: any) {
    const axiosError = error as AxiosError;
    console.error(
      `Error fetching from MediaStack API (attempt ${retryCount + 1}):`,
      axiosError.response?.status,
      axiosError.message
    );
    if (axiosError.response?.status === 429 && retryCount < maxRetries) {
      const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
      console.log(
        `Rate limit exceeded. Retrying in ${delay / 1000} seconds...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return fetchNewsFromApi(
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

export async function GET() {
  const now = Date.now();
  const includedCategories = 'general,business,health,science,technology';
  const excludedKeywordsList =
    'football,soccer,cricket,rugby,basketball,nba,a-league,grand final,athlete,team,match,celebrity,actor,singer,movie,tv show,album,gossip,film,music,entertainment,lifestyle,fashion,travel,food,recipe,local news,shop,store,sport,game,league,club,player,coach,stadium,arena,score,win,lose,defeat,cup,championship,final,draft,trade';
  const includedSources = 'abc-news-au,crikey,the-age';

  const keywordsApiFilter = excludedKeywordsList
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k)
    .map((k) => `-${k}`)
    .join(','); //

  if (checkCache() && cachedRawNews) {
    console.log('Using cached raw news, re-processing with AI 📰');
    const truncatedArticles = cachedRawNews.map(truncateArticleContent);
    const filteredArticles = await getFilteredTopStories(truncatedArticles);
    const summarizedArticles = await getSummaryFromAI(filteredArticles);
    return NextResponse.json(summarizedArticles);
  }

  try {
    console.log('Fetching fresh news from Australia 🌍');

    if (!API_KEY) {
      console.error('Error: MEDIASTACK_API_KEY is not set.');
      return NextResponse.json(
        { error: 'API key not configured. Please contact support.' },
        { status: 500 }
      );
    }
    if (!OPENAI_KEY) {
      console.error('Error: OPENAI_API_KEY is not set.');
      return NextResponse.json(
        { error: 'OpenAI API key not configured. Please contact support.' },
        { status: 500 }
      );
    }

    const rawArticlesFromAPI = await fetchNewsFromApi(
      API_KEY,
      includedSources,
      includedCategories,
      keywordsApiFilter
    );

    console.log(
      `Received ${rawArticlesFromAPI?.length || 0} articles from MediaStack.`
    );

    if (!rawArticlesFromAPI || rawArticlesFromAPI.length === 0) {
      console.log('No articles received from MediaStack or array is empty.');
      return NextResponse.json([]);
    }

    cachedRawNews = rawArticlesFromAPI;
    lastFetchedTime = now;

    const truncatedArticles = rawArticlesFromAPI.map(truncateArticleContent);
    const filteredArticles = await getFilteredTopStories(truncatedArticles);
    const summarizedArticles = await getSummaryFromAI(filteredArticles);

    return NextResponse.json(summarizedArticles);
  } catch (error: any) {
    console.error(
      'Error in GET handler while fetching or processing news:',
      error.message
    );
    if (error instanceof AxiosError) {
      const status = error.response?.status || 500;
      let message = `Failed to fetch news from MediaStack: ${error.message}`;
      if (status === 429) {
        message =
          'Too Many Requests - The news API rate limit was exceeded. Please try again later.';
      } else if (status === 401 || status === 403) {
        message =
          'API key issue or access denied for news source. Please contact support.';
      }
      return NextResponse.json({ error: message }, { status });
    } else {
      return NextResponse.json(
        {
          error: `An unexpected error occurred: ${
            error.message || 'Unknown error'
          }`,
        },
        { status: 500 }
      );
    }
  }
}
