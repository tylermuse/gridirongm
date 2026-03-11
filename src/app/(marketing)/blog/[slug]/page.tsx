import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { blogPosts, getPostBySlug } from '@/lib/content/posts';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return blogPosts.map(post => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  return {
    title: post.seoTitle,
    description: post.metaDescription,
    keywords: post.keywords,
    openGraph: {
      title: post.seoTitle,
      description: post.metaDescription,
      url: `https://gridirongm.com/blog/${post.slug}`,
      type: 'article',
    },
    alternates: {
      canonical: `https://gridirongm.com/blog/${post.slug}`,
    },
  };
}

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

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const jsonLd = post.schema === 'HowTo'
    ? {
        '@context': 'https://schema.org',
        '@type': 'HowTo',
        name: post.title,
        description: post.metaDescription,
      }
    : post.schema === 'FAQ'
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        name: post.title,
        description: post.metaDescription,
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        description: post.metaDescription,
        datePublished: post.publishDate,
      };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        {/* Breadcrumbs */}
        <nav className="text-sm text-gray-500 mb-6">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/blog" className="hover:text-gray-700">Blog</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-900 truncate">{post.title}</span>
        </nav>

        {/* Header */}
        <header className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${CATEGORY_COLORS[post.category] || 'bg-gray-100 text-gray-600'}`}>
              {CATEGORY_LABELS[post.category] || post.category}
            </span>
            <span className="text-sm text-gray-400">
              {post.readingTime} min read
            </span>
            <span className="text-sm text-gray-400">
              {new Date(post.publishDate).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight">
            {post.title}
          </h1>
        </header>

        {/* Content */}
        <div
          className="prose prose-gray prose-lg max-w-none
            prose-headings:font-bold prose-headings:text-gray-900
            prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
            prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
            prose-p:text-gray-700 prose-p:leading-relaxed
            prose-li:text-gray-700
            prose-strong:text-gray-900
            prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
            prose-table:border-collapse prose-th:bg-gray-50 prose-th:p-3 prose-th:text-left prose-th:text-sm prose-th:font-semibold
            prose-td:p-3 prose-td:text-sm prose-td:border-t prose-td:border-gray-100"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {/* CTA */}
        <div className="mt-12 py-8 px-6 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Ready to put this into practice?</h2>
          <p className="text-gray-600 mb-5">
            Gridiron GM is free, runs in your browser, and you&apos;ll be drafting in 60 seconds.
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
          >
            Play Now — It&apos;s Free
          </Link>
        </div>

        {/* Related Links */}
        {post.internalLinks.length > 0 && (
          <div className="mt-10 pt-8 border-t border-gray-200">
            <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Related Reading</h3>
            <div className="flex flex-wrap gap-2">
              {post.internalLinks.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:text-blue-600 hover:border-blue-300 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </article>
    </>
  );
}
