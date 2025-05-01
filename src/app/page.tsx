'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [news, setNews] = useState<any[]>([]);
  const [upliftingNews, setUplfitingNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const response = await fetch('/api/news');
        const data = await response.json();
        setNews(data);
      } catch (err) {
        console.error(err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    const fetchUpliftingNews = async () => {
      try {
        const response = await fetch('/api/upliftingNews');
        const data = await response.json();
        setUplfitingNews(data);
      } catch (err) {
        console.error(err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    setLoading(true);
    setError(false);

    Promise.all([fetchNews(), fetchUpliftingNews()]).finally(() =>
      setLoading(false)
    );
  }, []);

  if (loading)
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-lg text-gray-600 animate-pulse">
          Loading the important stuff and the happy stuff...
        </p>
      </div>
    );
  if (error)
    return (
      <div className="flex justify-center items-center h-screen">
        <p className="text-red-500 font-semibold">
          Uh oh! Something went wrong fetching the news.
        </p>
      </div>
    );

  const headingMinHeight = 'min-h-[3rem] flex items-center';

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-6 md:px-12 lg:px-24 grid grid-cols-1 md:grid-cols-[60%_40%] gap-8">
      {/* Must Read News Section */}
      <section className="md:border-r-2 md:border-gray-200 pr-6">
        {/* Add right border */}
        <h2
          className={`text-xl md:text-2xl font-extrabold text-gray-800 mb-5 ${headingMinHeight}`}
        >
          <span className="">The Difficult News</span>
        </h2>
        <ul className="space-y-6">
          {news.map((article) => (
            <li
              key={article.url}
              className="bg-white rounded-md shadow-md p-4 hover:shadow-lg transition duration-300"
            >
              <a
                href={article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-500 hover:text-cyan-700 hover:underline block"
              >
                <h3 className="font-semibold text-lg mb-1">{article.title}</h3>
              </a>
              {article.summary && (
                <ul className="list-disc pl-5 mt-2 text-gray-700 text-sm">
                  {article.summary.map((point: string, index: number) => (
                    <li key={index}>{point}</li>
                  ))}
                </ul>
              )}
              {!article.summary && (
                <p className="text-gray-500 text-sm mt-2">
                  Summary not available.
                </p>
              )}
            </li>
          ))}
          {news.length === 0 && (
            <p className="text-gray-500">No must-read news at the moment.</p>
          )}
        </ul>
      </section>

      {/* Uplifting News Section */}
      <section className="pl-6">
        {/* Add left padding for spacing */}
        <h2
          className={`text-xl md:text-2xl font-extrabold text-sky-800 mb-5 ${headingMinHeight}`}
        >
          <span className="">The Good News</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {upliftingNews.map((article) => (
            <div
              key={article.url}
              className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition duration-300"
            >
              <div className="p-4">
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-500 hover:text-sky-700 hover:underline block"
                >
                  <h3 className="font-semibold text-lg mb-2">
                    {article.title}
                  </h3>
                </a>
              </div>
            </div>
          ))}
          {upliftingNews.length === 0 && (
            <p className="text-gray-500">
              No uplifting news to share right now. Check back later!
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
