'use client';

import { useState } from 'react';
import * as Icons from '@/components/ui/Icons';
import { useLang } from '@/components/providers/LangProvider';

// Growing stages timeline — real microgreen growth cycle
const GROW_STAGES = [
  {
    day: 1,
    titleUz: 'Urug\'larni ekish',
    titleRu: 'Посадка семян',
    descUz: 'Sifatli substratga urug\'lar ekiladi va nam muhit yaratiladi',
    descRu: 'Семена высаживаются в качественный субстрат и создаётся влажная среда',
    color: '#8B5CF6',
    icon: 'seed',
  },
  {
    day: 3,
    titleUz: 'Unib chiqish',
    titleRu: 'Прорастание',
    descUz: 'Urug\'lar unib chiqadi, dastlabki ildizlar ko\'rinadi',
    descRu: 'Семена прорастают, появляются первые корешки',
    color: '#10B981',
    icon: 'sprout',
  },
  {
    day: 5,
    titleUz: 'O\'sish bosqichi',
    titleRu: 'Стадия роста',
    descUz: 'Barglar ochiladi, fotosintez boshlanadi. Yorug\'lik va suv muhim',
    descRu: 'Листочки раскрываются, начинается фотосинтез. Свет и вода важны',
    color: '#3B82F6',
    icon: 'grow',
  },
  {
    day: 7,
    titleUz: 'Yig\'im — Tayyor!',
    titleRu: 'Срез — Готово!',
    descUz: 'Mikroko\'katlar to\'liq yetildi. Yangi va sog\'lom holda yetkaziladi',
    descRu: 'Микрозелень полностью созрела. Доставляется свежей и полезной',
    color: '#F59E0B',
    icon: 'harvest',
  },
];

const INSTAGRAM_HANDLE = 'microgreenuzbekistan';
const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM_HANDLE}`;

// Simulated Instagram posts — real content descriptions
const INSTA_POSTS = [
  {
    captionUz: 'Bugungi hosilimiz — yangi kesilgan rukkola mikroko\'kati',
    captionRu: 'Сегодняшний урожай — свежесрезанная микрозелень руккола',
    likes: 124,
    type: 'harvest',
  },
  {
    captionUz: 'Qizil karamning 3-kunlik o\'sish jarayoni',
    captionRu: 'Процесс роста красной капусты на 3-й день',
    likes: 89,
    type: 'growing',
  },
  {
    captionUz: 'Mijozlarimiz uchun yangi partiya tayyorlanmoqda',
    captionRu: 'Готовим новую партию для наших клиентов',
    likes: 156,
    type: 'prep',
  },
  {
    captionUz: 'Brokkoli mikroko\'kati — vitaminlar xazinasi',
    captionRu: 'Микрозелень брокколи — кладезь витаминов',
    likes: 201,
    type: 'product',
  },
  {
    captionUz: 'Quyosh nurida o\'sayotgan kungaboqar mikroko\'kati',
    captionRu: 'Микрозелень подсолнечника растёт на солнце',
    likes: 167,
    type: 'growing',
  },
  {
    captionUz: 'Restoranga yetkazib berish — HoReCa xizmati',
    captionRu: 'Доставка в ресторан — сервис HoReCa',
    likes: 93,
    type: 'delivery',
  },
];

const POST_COLORS: Record<string, string> = {
  harvest: '#10B981',
  growing: '#3B82F6',
  prep: '#8B5CF6',
  product: '#F59E0B',
  delivery: '#EC4899',
};

function StageIcon({ type, size = 24 }: { type: string; size?: number }) {
  if (type === 'seed') return <Icons.Droplet size={size} />;
  if (type === 'sprout') return <Icons.Leaf size={size} />;
  if (type === 'grow') return <Icons.Sun size={size} />;
  if (type === 'harvest') return <Icons.CheckCircle size={size} />;
  return <Icons.Leaf size={size} />;
}

export function InstagramFeed() {
  const { t } = useLang();
  const [activeStage, setActiveStage] = useState(3); // default to harvest

  return (
    <section style={{
      padding: 'var(--space-10) 0', background: 'var(--bg-primary)',
      borderTop: '1px solid var(--border)',
    }}>
      <div className="container">
        {/* Section Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)',
        }}>
          <div>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontWeight: 'var(--font-extrabold)',
              fontSize: 'var(--text-2xl)', display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <Icons.Leaf size={24} style={{ color: 'var(--brand-primary)' }} />
              {t("O'sish jarayoni", 'Процесс выращивания')}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: '4px' }}>
              {t(
                "Urug'dan stolga — har bir bosqichni Instagramda kuzating",
                'От семечка до стола — следите за каждым этапом в Instagram'
              )}
            </p>
          </div>
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer"
            className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '20px' }}
            id="instagram-follow-btn"
          >
            <Icons.Instagram size={16} />
            {t("Obuna bo'lish", 'Подписаться')}
          </a>
        </div>

        {/* Growing Timeline */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)',
          marginBottom: 'var(--space-6)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            marginBottom: 'var(--space-4)',
            fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600,
          }}>
            <Icons.Clock size={14} />
            {t('7 kunlik o\'sish sikli', '7-дневный цикл выращивания')}
          </div>

          {/* Timeline Steps */}
          <div style={{ display: 'flex', gap: 0, position: 'relative' }}>
            {/* Progress line */}
            <div style={{
              position: 'absolute', top: 20, left: 20, right: 20, height: 3,
              background: 'var(--bg-tertiary)', borderRadius: 2, zIndex: 0,
            }} />
            <div style={{
              position: 'absolute', top: 20, left: 20, height: 3,
              background: `linear-gradient(90deg, ${GROW_STAGES[0].color}, ${GROW_STAGES[activeStage].color})`,
              borderRadius: 2, zIndex: 1,
              width: `${(activeStage / (GROW_STAGES.length - 1)) * (100 - 12)}%`,
              transition: 'width 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
            }} />

            {GROW_STAGES.map((stage, i) => (
              <button key={i} onClick={() => setActiveStage(i)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  gap: '8px', background: 'none', border: 'none', cursor: 'pointer',
                  position: 'relative', zIndex: 2, padding: '0 4px',
                }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 'var(--radius-full)',
                  background: i <= activeStage
                    ? `linear-gradient(135deg, ${stage.color}, ${stage.color}DD)`
                    : 'var(--bg-tertiary)',
                  color: i <= activeStage ? 'white' : 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.3s ease',
                  boxShadow: i === activeStage ? `0 4px 16px ${stage.color}40` : 'none',
                  transform: i === activeStage ? 'scale(1.15)' : 'scale(1)',
                }}>
                  <StageIcon type={stage.icon} size={18} />
                </div>
                <span style={{
                  fontSize: '10px', fontWeight: 700,
                  color: i === activeStage ? stage.color : 'var(--text-muted)',
                  transition: 'color 0.3s',
                }}>
                  {t(`${stage.day}-kun`, `${stage.day} день`)}
                </span>
              </button>
            ))}
          </div>

          {/* Active Stage Info */}
          <div style={{
            marginTop: 'var(--space-4)', padding: 'var(--space-4)',
            background: `${GROW_STAGES[activeStage].color}0A`,
            borderRadius: 'var(--radius-lg)',
            border: `1px solid ${GROW_STAGES[activeStage].color}20`,
            transition: 'all 0.3s ease',
          }}>
            <div style={{
              fontWeight: 'var(--font-bold)', fontSize: 'var(--text-base)',
              color: GROW_STAGES[activeStage].color, marginBottom: '4px',
              fontFamily: 'var(--font-display)',
            }}>
              {t(GROW_STAGES[activeStage].titleUz, GROW_STAGES[activeStage].titleRu)}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {t(GROW_STAGES[activeStage].descUz, GROW_STAGES[activeStage].descRu)}
            </div>
          </div>
        </div>

        {/* Instagram Posts Grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px',
          borderRadius: 'var(--radius-xl)', overflow: 'hidden',
        }}>
          {INSTA_POSTS.map((post, i) => (
            <a key={i} href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer"
              style={{
                aspectRatio: '1', position: 'relative', overflow: 'hidden',
                background: `linear-gradient(135deg, ${POST_COLORS[post.type]}18, ${POST_COLORS[post.type]}08)`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                textDecoration: 'none', color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              {/* Icon placeholder */}
              <div style={{
                width: 44, height: 44, borderRadius: 'var(--radius-full)',
                background: `${POST_COLORS[post.type]}20`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: POST_COLORS[post.type], marginBottom: '8px',
              }}>
                {post.type === 'harvest' && <Icons.CheckCircle size={22} />}
                {post.type === 'growing' && <Icons.Leaf size={22} />}
                {post.type === 'prep' && <Icons.Clock size={22} />}
                {post.type === 'product' && <Icons.Star size={22} />}
                {post.type === 'delivery' && <Icons.Truck size={22} />}
              </div>
              <div style={{
                fontSize: '11px', fontWeight: 600, textAlign: 'center',
                padding: '0 8px', color: 'var(--text-secondary)',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                overflow: 'hidden', lineHeight: 1.4,
              }}>
                {t(post.captionUz, post.captionRu)}
              </div>
              {/* Likes */}
              <div style={{
                position: 'absolute', bottom: 6, right: 8,
                fontSize: '10px', color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', gap: '3px',
              }}>
                <Icons.Heart size={10} /> {post.likes}
              </div>
              {/* Instagram overlay on hover */}
              <div style={{
                position: 'absolute', top: 6, left: 6,
                fontSize: '9px', color: POST_COLORS[post.type],
                fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                <Icons.Instagram size={12} />
              </div>
            </a>
          ))}
        </div>

        {/* CTA Bar */}
        <div style={{
          marginTop: 'var(--space-4)', padding: 'var(--space-4)',
          background: 'linear-gradient(135deg, #833AB420, #C13584 20, #E1306C10)',
          borderRadius: 'var(--radius-xl)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 'var(--space-3)',
          border: '1px solid rgba(193, 53, 132, 0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: 44, height: 44, borderRadius: 'var(--radius-full)',
              background: 'linear-gradient(135deg, #833AB4, #E1306C, #F77737)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white',
            }}>
              <Icons.Instagram size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 'var(--font-bold)', fontSize: 'var(--text-sm)' }}>
                @{INSTAGRAM_HANDLE}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                {t(
                  "Har kuni yangi kontent — o'sish, yig'im, retseptlar",
                  'Ежедневный контент — рост, урожай, рецепты'
                )}
              </div>
            </div>
          </div>
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer"
            style={{
              padding: '10px 24px', borderRadius: '20px', border: 'none',
              background: 'linear-gradient(135deg, #833AB4, #E1306C)',
              color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)',
              textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px',
              boxShadow: '0 4px 16px rgba(225, 48, 108, 0.3)',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <Icons.Instagram size={16} />
            {t("Instagram ochish", 'Открыть Instagram')}
          </a>
        </div>
      </div>
    </section>
  );
}
