'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const response = await fetch('/api/news');
        const data = await response.json();
        setNews(data);
      } catch (err) {
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchNews();
  }, []);

  if (loading) return <p>Loading news...</p>;
  if (error) return <p>Failed to load news.</p>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Top News</h1>
      <ul>
        {news.map((article) => (
          <li key={article.url} className="mb-4">
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              <h2 className="font-semibold">{article.title}</h2>
            </a>
            <ul className="list-disc pl-5 mt-2">
              {article.summary?.map((point: string, index: number) => (
                <li key={index}>{point}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
