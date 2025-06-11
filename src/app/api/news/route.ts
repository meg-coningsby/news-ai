import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

interface ProcessedArticle {
  title: string | null;
  summary: string[];
  url: string | null;
  image?: string | null;
  sourceName?: string | null;
  published_at?: string | null;
}
const GENERAL_NEWS_REDIS_KEY = 'todays_general_news';

export async function GET() {
  console.log(
    `API: Fetching general news from Vercel KV with key: ${GENERAL_NEWS_REDIS_KEY}`
  );

  try {
    const articles = await kv.get<ProcessedArticle[]>(GENERAL_NEWS_REDIS_KEY);

    if (articles) {
      console.log(
        `API: Found and returning ${articles.length} general news articles.`
      );
      return NextResponse.json(articles);
    } else {
      console.warn(`API: No data found for key "${GENERAL_NEWS_REDIS_KEY}".`);
      return NextResponse.json(
        {
          message:
            'News for today is not yet available. Please try again later.',
        },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('API: Error fetching general news from Vercel KV:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve news due to a server error.' },
      { status: 500 }
    );
  }
}
