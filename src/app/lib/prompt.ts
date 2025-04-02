export const SELECT_TOP_STORIES_PROMPT = (articles: any[]) => `
You are an AI news assistant. Your task is to select the **7 most important news stories** from this list.

Here are recent news articles: 
${JSON.stringify(articles, null, 2)}

Rules:
- Choose **7 articles in total**, ensuring a **mix** from global, Australian, and Melbourne/Victoria news.
- Prioritize **importance, impact, and relevance**.
- Ensure **topic diversity** (not all politics, not all disasters).
- Avoid duplicate or near-identical stories.

Return JSON in this format:
{
  "topStories": [...7 selected articles...]
}
`;

// Updated to expect a single article and return the format your frontend expects
export const REWRITE_SUMMARIZE_PROMPT = (article: any) => `
You are an AI news editor. Your job is to summarize news articles in a clear, concise way.

Here is the news article:
${JSON.stringify(article, null, 2)}

Please:
1. Create a more informative title if needed (or keep the original if it's already good)
2. Generate 3-5 bullet points that summarize the key information from this article

Return ONLY a JSON object in this format:
{
  "title": "The informative title",
  "summary": ["Bullet point 1", "Bullet point 2", "Bullet point 3"]
}
`;
