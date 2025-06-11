import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

interface ProcessedUpliftingArticle {
  title: string;
  url: string;
  source: string;
  summary: string[];
}

const UPLIFTING_NEWS_REDIS_KEY = 'todays_uplifting_news';

export async function GET() {
  console.log(
    `API: Fetching uplifting news from Vercel KV with key: ${UPLIFTING_NEWS_REDIS_KEY}`
  );

  try {
    const articles = await kv.get<ProcessedUpliftingArticle[]>(
      UPLIFTING_NEWS_REDIS_KEY
    );

    if (articles) {
      console.log(
        `API: Found and returning ${articles.length} uplifting news articles.`
      );
      return NextResponse.json(articles);
    } else {
      console.warn(`API: No data found for key "${UPLIFTING_NEWS_REDIS_KEY}".`);
      return NextResponse.json(
        {
          message:
            'Uplifting news for today is not yet available. Please try again later.',
        },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('API: Error fetching uplifting news from Vercel KV:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve uplifting news due to a server error.' },
      { status: 500 }
    );
  }
}
