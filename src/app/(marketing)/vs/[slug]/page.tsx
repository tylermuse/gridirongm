import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { seoPages, getPageBySlug } from '@/lib/content/pages';

interface Props {
  params: Promise<{ slug: string }>;
}

const section = 'vs';

export async function generateStaticParams() {
  return seoPages.filter(p => p.section === section).map(p => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getPageBySlug(section, slug);
  if (!page) return {};
  return {
    title: page.seoTitle,
    description: page.metaDescription,
    keywords: page.keywords,
    openGraph: {
      title: page.seoTitle,
      description: page.metaDescription,
      url: `https://gridirongm.com/${section}/${page.slug}`,
    },
    alternates: { canonical: `https://gridirongm.com/${section}/${page.slug}` },
  };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const page = getPageBySlug(section, slug);
  if (!page) notFound();

  const jsonLd = page.schema === 'FAQ'
    ? { '@context': 'https://schema.org', '@type': 'FAQPage', name: page.title, description: page.metaDescription }
    : { '@context': 'https://schema.org', '@type': 'WebPage', name: page.title, description: page.metaDescription };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        <nav className="text-sm text-gray-500 mb-6">
          <Link href="/" className="hover:text-gray-700">Home</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-500">vs</span>
          <span className="mx-2">/</span>
          <span className="text-gray-900">{page.title}</span>
        </nav>

        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-10">{page.title}</h1>

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
          dangerouslySetInnerHTML={{ __html: page.content }}
        />

        <div className="mt-12 py-8 px-6 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">See for yourself</h2>
          <p className="text-gray-600 mb-5">Gridiron GM is free, runs in your browser, and you&apos;ll be drafting in 60 seconds.</p>
          <Link href="/" className="inline-block px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors">
            Play Now — It&apos;s Free
          </Link>
        </div>

        {page.internalLinks.length > 0 && (
          <div className="mt-10 pt-8 border-t border-gray-200">
            <h3 className="text-sm font-bold text-gray-900 mb-3 uppercase tracking-wider">Related</h3>
            <div className="flex flex-wrap gap-2">
              {page.internalLinks.map(link => (
                <Link key={link.href} href={link.href} className="text-sm px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:text-blue-600 hover:border-blue-300 transition-colors">
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
