import { SeoLandingPage, seoMetadata, seoStaticParams } from '@/components/content/SeoLanding';

const section = 'vs';

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return seoStaticParams(section);
}

export async function generateMetadata({ params }: Props) {
  return seoMetadata(section, (await params).slug);
}

export default async function Page({ params }: Props) {
  return <SeoLandingPage section={section} slug={(await params).slug} />;
}
