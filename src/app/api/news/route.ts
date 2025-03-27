import { NextResponse } from 'next/server';
import axios from 'axios';

const API_KEY = process.env.MEDIASTACK_API_KEY;
const BASE_URL = 'http://api.mediastack.com/v1/news';

export async function GET() {
  try {
    const response = await axios.get(BASE_URL, {
      params: { access_key: API_KEY, countries: 'au,us,gb', languages: 'en', limit: 5 },
    });

    return NextResponse.json(response.data);
  } catch (error) {
    return NextResponse.json({ error: `Failed to fetch news: ${error}` }, { status: 500 });
  }
}
