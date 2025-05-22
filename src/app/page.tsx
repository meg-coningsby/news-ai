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
      <div className="flex flex-col justify-center items-center h-screen bg-slate-50">
        <div className="text-center">
          <p className="text-2xl font-semibold text-slate-700">
            Doom & Bloom <span className="text-slate-400">Daily</span>
          </p>
          <p className="text-lg text-emerald-600 animate-pulse mt-2">
            Brewing the headlines & harvesting the happiness...
          </p>
        </div>
      </div>
    );

  if (error)
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-slate-50">
        <div className="text-center p-8 bg-white shadow-xl rounded-lg">
          <p className="text-2xl font-semibold text-red-600">
            Well, this is awkward.
          </p>
          <p className="text-red-500 mt-2">
            Something went sideways fetching the news. Please try refreshing!
          </p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-100">
      {' '}
      <header className="text-center py-8 md:py-12 bg-white shadow-sm">
        <h1 className="text-4xl md:text-5xl font-bold">
          <span className="text-slate-700">Doom & </span>
          <span className="text-emerald-600">Bloom Daily</span>
        </h1>
      </header>
      <main className="py-8 md:py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-screen-xl mx-auto grid grid-cols-1 md:grid-cols-[60%_auto] gap-8 md:gap-10">
          <section className="md:pr-5">
            {' '}
            <ul className="space-y-6">
              {news.map((article) => (
                <li
                  key={article.url}
                  className="bg-white rounded-xl shadow-lg p-5 hover:shadow-xl transition-shadow duration-300 border-l-4 border-slate-300"
                >
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group"
                  >
                    <h3 className="font-semibold text-lg text-slate-800 group-hover:text-black mb-3 transition-colors duration-200">
                      {' '}
                      {article.title}
                    </h3>
                  </a>
                  {article.summary && article.summary.length > 0 && (
                    <ul className="list-disc pl-5 mt-2 text-slate-600 text-sm space-y-1 leading-relaxed">
                      {' '}
                      {article.summary.map((point: string, index: number) => (
                        <li key={index}>{point}</li>
                      ))}
                    </ul>
                  )}
                  {!article.summary ||
                    (article.summary.length === 0 && (
                      <p className="text-slate-500 text-sm mt-2">
                        Summary not available for this one.
                      </p>
                    ))}
                </li>
              ))}
              {news.length === 0 && !loading && (
                <div className="bg-white rounded-xl shadow-lg p-5 text-center">
                  <p className="text-slate-500 font-medium">
                    No doom to report right now... surprisingly.
                  </p>
                </div>
              )}
            </ul>
          </section>

          <section className="md:pl-5">
            {' '}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {upliftingNews.map((article) => (
                <div
                  key={article.url}
                  className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-2xl hover:scale-[1.03] transition-all duration-300 flex flex-col border-l-4 border-emerald-500 hover:border-emerald-400 group"
                >
                  <div className="p-5 flex-grow">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <h3 className="font-semibold text-lg text-emerald-700 group-hover:text-emerald-900 mb-2 leading-tight transition-colors duration-200">
                        {article.title}
                      </h3>
                    </a>
                  </div>
                </div>
              ))}
              {upliftingNews.length === 0 && !loading && (
                <div className="bg-white rounded-xl shadow-lg p-5 text-center sm:col-span-2">
                  <p className="text-emerald-600 font-medium">
                    Searching for sunshine... check back soon!
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
      <footer className="text-center py-10 mt-10 border-t border-slate-200">
        <p className="text-sm text-slate-500">Stay informed, stay hopeful.</p>
        <p className="text-xs text-slate-400 mt-1">
          News sourced from Mediastack API. Uplifting news sourced from
          r/UpliftingNews on Reddit. Both have headlines and summaries rewritten
          by AI to present the news as plainly as possible.
        </p>
      </footer>
    </div>
  );
}
