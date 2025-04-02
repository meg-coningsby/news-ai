import { NextResponse } from 'next/server';
import axios from 'axios';
import OpenAI from 'openai';
import {
  SELECT_TOP_STORIES_PROMPT,
  REWRITE_SUMMARIZE_PROMPT,
} from '../../lib/prompt';

const API_KEY = process.env.MEDIASTACK_API_KEY;
const BASE_URL = 'http://api.mediastack.com/v1/news';
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({ apiKey: OPENAI_KEY });

let cachedRawNews: any = null;
let lastFetchedTime: number = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000;

function truncateArticleContent(article: any) {
  return {
    title: article.title,
    summary: article.description,
    url: article.url,
  };
}

async function getFilteredTopStories(articles: any[]) {
  const truncatedArticles = articles.map(truncateArticleContent);

  const prompt = SELECT_TOP_STORIES_PROMPT(truncatedArticles);

  console.log('Filtering the top news stories...');

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
    console.error('Error filtering top stories:', error);
    return [];
  }
}

async function getSummaryFromAI(articles: any[]) {
  console.log('Summarising the top news stories...');
  const summaries = [];

  // Make sure articles is an array before proceeding
  if (!Array.isArray(articles)) {
    console.error('Articles is not an array:', articles);
    if (articles.topStories && Array.isArray(articles.topStories)) {
      articles = articles.topStories;
    } else {
      return [];
    }
  }

  for (const article of articles) {
    try {
      const prompt = REWRITE_SUMMARIZE_PROMPT(article);

      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
      });

      const aiResponse = completion.choices[0].message.content ?? '';

      try {
        const parsedResponse = JSON.parse(aiResponse);
        // Use the parsed response directly - it should already have title and summary
        summaries.push({
          ...article,
          title: parsedResponse.title || article.title,
          summary: parsedResponse.summary || ['No summary available'],
        });
      } catch (parseError) {
        console.error('Error parsing AI response:', parseError);
        // Fallback if parsing fails
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
  if (cachedRawNews && now - lastFetchedTime < CACHE_DURATION) {
    console.log('Using cached raw news, but processing with AI 📰');
    const filteredArticles = await getFilteredTopStories(cachedRawNews);
    const summarizedArticles = await getSummaryFromAI(filteredArticles);
    return NextResponse.json(summarizedArticles);
  }

  try {
    console.log('Fetching fresh news from API 🌍');
    const response = await axios.get(BASE_URL, {
      params: {
        access_key: API_KEY,
        countries: 'au',
        languages: 'en',
        limit: 25,
      },
    });

    console.log('API response received');
    const articles = response.data.data;
    cachedRawNews = articles;
    lastFetchedTime = now;

    const filteredArticles = await getFilteredTopStories(articles);
    const summarizedArticles = await getSummaryFromAI(filteredArticles);

    return NextResponse.json(summarizedArticles);
  } catch (error) {
    console.error('Error fetching or processing news:', error);
    return NextResponse.json(
      { error: `Failed to fetch news: ${error}` },
      { status: 500 }
    );
  }
}
