import { NextResponse } from 'next/server';
import axios from 'axios';
import OpenAI from 'openai';
import {
  SELECT_UPLIFTING_STORIES_PROMPT,
  REWRITE_UPLIFTING_PROMPT,
} from '../../lib/prompt';

const REDDIT_URL = 'https://www.reddit.com/r/UpliftingNews/.json';
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
    summary: article.description,
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

export async function GET() {
  const now = Date.now();

  // Use cached raw news if available
  if (checkCache()) {
    console.log('Using cached raw uplifting news, but processing with AI 📰');
    const filteredResult = await getFilteredTopStories(cachedRedditNews);
    const articlesToSummarize =
      filteredResult?.upliftingStories || filteredResult || [];
    const summarizedArticles = await getSummaryFromAI(articlesToSummarize);
    return NextResponse.json(summarizedArticles);
  }

  try {
    console.log('Fetching fresh news from Uplifting News');

    const response = await axios.get(REDDIT_URL);

    console.log(
      `Received ${
        response.data?.data?.children?.length || 0
      } uplifting articles from reddit`
    );

    if (
      !response.data?.data?.children ||
      !Array.isArray(response.data.data.children)
    ) {
      console.error('Invalid API response structure:', response.data);
      return NextResponse.json(
        { error: 'Invalid API response structure' },
        { status: 500 }
      );
    }

    const articles = response.data.data.children.map(
      (child: {
        data: { title: any; url: any; subreddit_name_prefixed: any };
      }) => ({
        title: child.data.title,
        url: child.data.url,
        source: child.data.subreddit_name_prefixed,
        reddit_data: child.data,
      })
    );

    cachedRedditNews = articles;
    lastFetchedTime = now;

    const filteredResult = await getFilteredTopStories(articles);
    const articlesToSummarize =
      filteredResult?.upliftingStories || filteredResult || [];
    const summarizedArticles = await getSummaryFromAI(articlesToSummarize);

    return NextResponse.json(summarizedArticles);
  } catch (error) {
    console.error('Error fetching or processing uplifting news:', error);
    return NextResponse.json(
      { error: `Failed to fetch uplifting news: ${error}` },
      { status: 500 }
    );
  }
}
