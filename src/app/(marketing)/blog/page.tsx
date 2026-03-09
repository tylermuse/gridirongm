import Link from 'next/link';
import type { Metadata } from 'next';
import { getPublishedPosts } from '@/lib/content/posts';

export const metadata: Metadata = {
  title: 'Blog — Gridiron GM',
  description: 'Tips, strategies, and guides for football management games. Draft strategy, salary cap management, dynasty building, and more.',
  openGraph: {
    title: 'Blog — Gridiron GM',
    description: 'Tips, strategies, and guides for football management games.',
    url: 'https://gridirongm.com/blog',
  },
};

const CATEGORY_COLORS: Record<string, string> = {
  draft: 'bg-blue-100 text-blue-700',
  'salary-cap': 'bg-green-100 text-green-700',
  comparison: 'bg-purple-100 text-purple-700',
  strategy: 'bg-amber-100 text-amber-700',
  lifestyle: 'bg-rose-100 text-rose-700',
};

const CATEGORY_LABELS: Record<string, string> = {
  draft: 'Draft & Scouting',
  'salary-cap': 'Salary Cap',
  comparison: 'Comparison',
  strategy: 'Strategy',
  lifestyle: 'Lifestyle',
};

function excerpt(html: string, maxLen = 160): string {
  const text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s\S*$/, '') + '...';
}

export default function BlogIndex() {
  const posts = getPublishedPosts();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      {/* Breadcrumbs */}
      <nav className="text-sm text-gray-500 mb-6">
        <Link href="/" className="hover:text-gray-700">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900">Blog</span>
      </nav>

      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Blog</h1>
      <p className="text-lg text-gray-600 mb-10">
        Tips, strategies, and guides for football management games.
      </p>

      {posts.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-lg">New content coming soon.</p>
          <p className="mt-2">Check back Tuesday for our first post.</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {posts.map(post => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group block rounded-xl border border-gray-200 bg-white p-6 hover:border-blue-400 hover:shadow-lg hover:shadow-blue-500/10 transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${CATEGORY_COLORS[post.category] || 'bg-gray-100 text-gray-600'}`}>
                  {CATEGORY_LABELS[post.category] || post.category}
                </span>
                <span className="text-xs text-gray-400">
                  {post.readingTime} min read
                </span>
              </div>
              <h2 className="text-lg font-bold text-gray-900 group-hover:text-blue-600 transition-colors mb-2 leading-snug">
                {post.title}
              </h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                {excerpt(post.content)}
              </p>
              <div className="mt-4 text-xs text-gray-400">
                {new Date(post.publishDate).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* CTA */}
      <div className="mt-16 text-center py-10 px-6 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Ready to play?</h2>
        <p className="text-gray-600 mb-6">
          Gridiron GM is free, runs in your browser, and you&apos;ll be drafting in 60 seconds.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
        >
          Play Now — It&apos;s Free
        </Link>
      </div>
    </div>
  );
}
