import { GROUP_COLORS } from '@/utils/mock-data';

interface HeroBlog {
  id: string;
  member_name: string;
  title: string;
  group: 'nogizaka' | 'sakurazaka' | 'hinatazaka';
  group_name: string;
  formatted_date: string;
  preview: string;
  hero_image: string | null;
}

interface Props {
  blog?: HeroBlog | null;
}

export default function HeroCarousel({ blog }: Props) {
  if (!blog) {
    return (
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-[var(--text-primary)] tracking-tight">
            Sakamichi Tools
          </h1>
          <p className="mt-3 text-base text-[var(--text-secondary)]">
            坂道系列综合粉丝平台
          </p>
          <div className="mt-3 flex justify-center gap-1.5">
            <span className="w-8 h-0.5 rounded-full bg-[var(--color-brand-nogi)]" />
            <span className="w-8 h-0.5 rounded-full bg-[var(--color-brand-sakura)]" />
            <span className="w-8 h-0.5 rounded-full bg-[var(--color-brand-hinata)]" />
          </div>
        </div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[var(--bg-secondary)] to-[var(--bg-primary)]" />
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden">
      <a
        href={`/blog#blog/${blog.id}`}
        data-astro-reload
        className="block max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8"
      >
        <div className="flex flex-col sm:flex-row items-start gap-5">
          {/* Blog image or avatar fallback */}
          {blog.hero_image ? (
            <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl shrink-0 overflow-hidden bg-[var(--bg-tertiary)]">
              <img
                src={blog.hero_image}
                alt={blog.title}
                className="w-full h-full object-cover"
                loading="eager"
              />
            </div>
          ) : (
            <div
              className="w-24 h-24 sm:w-32 sm:h-32 rounded-2xl shrink-0 flex items-center justify-center text-white text-3xl font-bold"
              style={{ backgroundColor: GROUP_COLORS[blog.group] }}
            >
              {blog.member_name.charAt(0)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: GROUP_COLORS[blog.group] }}
              />
              <span className="text-xs text-[var(--text-tertiary)]">
                {blog.formatted_date}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--text-primary)] mb-2">
              {blog.member_name}「{blog.title}」
            </h2>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-3 max-w-2xl">
              {blog.preview}
            </p>
            <span className="mt-3 inline-flex items-center text-sm font-medium" style={{ color: GROUP_COLORS[blog.group] }}>
              阅读全文 →
            </span>
          </div>
        </div>
      </a>

      {/* Background gradient */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[var(--bg-secondary)] to-[var(--bg-primary)]" />
    </section>
  );
}
