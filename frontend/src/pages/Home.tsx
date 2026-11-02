import { motion, useReducedMotion } from 'motion/react';
import { Icon, ThemePicker } from '../components/UI';
import './Home.scss';

const features = [
  {
    number: '01',
    icon: 'music',
    title: 'Âm nhạc cùng nhau',
    detail: 'Tìm bài hát, thêm playlist và điều khiển hàng chờ ngay trong voice channel.',
  },
  {
    number: '02',
    icon: 'pulse',
    title: 'Nắm rõ hoạt động',
    detail: 'Theo dõi voice, các thay đổi kênh và trạng thái bot từ một nơi.',
  },
  {
    number: '03',
    icon: 'clock',
    title: 'Tự động đúng lúc',
    detail: 'Lên lịch gửi tin nhắn và giữ cho những thông báo quan trọng không bị bỏ lỡ.',
  },
];
const commands = [
  { name: '/play', detail: 'Phát bài hát hoặc playlist', example: 'tên bài hát hoặc URL' },
  { name: '/search', detail: 'Tìm và chọn bài bạn thích', example: 'từ khóa tìm kiếm' },
  { name: '/queue', detail: 'Xem những bài đang chờ', example: 'xem hàng chờ' },
  { name: '/help', detail: 'Khám phá tất cả lệnh', example: 'xem hướng dẫn' },
];

export function Home() {
  const reduce = useReducedMotion();
  const reveal = {
    initial: { opacity: 0, y: reduce ? 0 : 18 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.18 },
    transition: {
      duration: reduce ? 0.05 : 0.45,
      ease: [0.23, 1, 0.32, 1] as [number, number, number, number],
    },
  };

  return (
    <div className="home">
      <header className="home-nav">
        <a className="home-brand" href="/" aria-label="Discord Control, trang chủ">
          <span className="home-brand-mark">
            <Icon name="bot" size={21} />
          </span>
          <span>
            Discord Control<small>MADE FOR YOUR COMMUNITY</small>
          </span>
        </a>
        <nav className="home-nav-links" aria-label="Điều hướng trang chủ">
          <a href="#features">Tính năng</a>
          <a href="#commands">Lệnh Discord</a>
          <a href="#start">Bắt đầu</a>
        </nav>
        <div className="home-nav-actions">
          <ThemePicker />
          <a href="/login" className="home-login">
            <span>Quản trị</span><Icon name="arrow" size={15} />
          </a>
        </div>
      </header>

      <main>
        <section className="home-hero" aria-labelledby="hero-title">
          <div className="home-hero-copy">
            <motion.div
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <h1 id="hero-title">
                Một nơi để
                <br />
                <em>cùng nhau.</em>
              </h1>
              <p className="home-lead">
                Âm nhạc, kết nối và những khoảnh khắc của cộng đồng — tất cả bắt đầu từ một lệnh đơn
                giản.
              </p>
              <div className="home-hero-actions">
                <a className="home-button primary" href="#commands">
                  Khám phá các lệnh <Icon name="arrow" size={17} />
                </a>
                <a className="home-button secondary" href="/login">
                  Mở trang quản trị <Icon name="arrow" size={16} />
                </a>
              </div>
              <div className="home-hero-caption">
                <span className="home-caption-icon">
                  <Icon name="shield" size={15} />
                </span>
                Được thiết kế cho không gian Discord của bạn.
              </div>
            </motion.div>
          </div>
          <motion.div
            className="home-hero-art"
            aria-label="Minh họa bảng điều khiển nhạc"
            initial={{ opacity: 0, y: reduce ? 0 : 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: reduce ? 0.05 : 0.55,
              delay: reduce ? 0 : 0.08,
              ease: [0.23, 1, 0.32, 1],
            }}
          >
            <div className="home-art-top">
              <span>YOUR SPACE, YOUR SOUND</span>
              <span>✳</span>
            </div>
            <div className="home-art-center">
              <div className="home-orbit orbit-one" />
              <div className="home-orbit orbit-two" />
              <div className="home-orbit orbit-three" />
              <div className="home-record">
                <div className="home-record-inner">
                  <Icon name="music" size={35} />
                </div>
              </div>
              <span className="home-orbit-label left">
                VOICE
                <br />
                CONNECTED
              </span>
              <span className="home-orbit-label right">
                GOOD
                <br />
                TOGETHER
              </span>
            </div>
            <div className="home-player">
              <div className="home-player-thumb">
                <Icon name="music" size={19} />
              </div>
              <div className="home-player-copy">
                <strong>Một chút nhạc nhé?</strong>
                <span>Bắt đầu bằng /play</span>
              </div>
              <div className="home-wave" aria-hidden="true">
                {[9, 17, 12, 24, 15, 21, 10, 16, 8].map((height, index) => (
                  <i key={index} className={`bar bar-${height}`} />
                ))}
              </div>
            </div>
            <div className="home-art-bottom">
              <span>ĐƯỢC TẠO CHO CỘNG ĐỒNG</span>
              <span aria-hidden="true">♪</span>
            </div>
          </motion.div>
          <div className="home-scroll">
            <span>CUỘN ĐỂ KHÁM PHÁ</span>
            <span aria-hidden="true">↓</span>
          </div>
        </section>

        <section className="home-features home-section" id="features">
          <motion.div {...reveal} className="home-section-intro">
            <div className="home-section-title">
              <span className="home-section-number" aria-hidden="true">01</span>
              <h2>
                Đơn giản để dùng.
                <br />
                <em>Đủ đầy để kết nối.</em>
              </h2>
            </div>
            <p>
              Một người bạn nhỏ cho máy chủ, giúp mọi cuộc trò chuyện và hoạt động diễn ra tự nhiên
              hơn.
            </p>
          </motion.div>
          <div className="home-feature-grid">
            {features.map((feature, index) => (
              <motion.article
                {...reveal}
                transition={{ ...reveal.transition, delay: reduce ? 0 : index * 0.07 }}
                className="home-feature"
                key={feature.number}
              >
                <div className="home-feature-top">
                  <span className="home-feature-icon">
                    <Icon name={feature.icon} size={22} />
                  </span>
                  <span className="home-item-number" aria-hidden="true">{feature.number}</span>
                </div>
                <h3>{feature.title}</h3>
                <p>{feature.detail}</p>
                <span className="home-feature-arrow" aria-hidden="true">
                  ↗
                </span>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="home-commands home-section" id="commands">
          <div className="home-commands-heading">
            <div className="home-section-title">
              <span className="home-section-number" aria-hidden="true">02</span>
              <h2>
                Gõ một lệnh.
                <br />
                <em>Mọi thứ sẵn sàng.</em>
              </h2>
            </div>
            <p>Vào kênh chat của máy chủ và dùng slash command để bắt đầu.</p>
            <a className="home-text-link" href="#start">
              Xem cách bắt đầu <span>↗</span>
            </a>
          </div>
          <div className="home-command-list">
            {commands.map((command, index) => (
              <motion.div
                {...reveal}
                transition={{ ...reveal.transition, delay: reduce ? 0 : index * 0.05 }}
                className="home-command"
                key={command.name}
              >
                <span className="home-command-index">0{index + 1}</span>
                <div>
                  <code>{command.name}</code>
                  <p>{command.detail}</p>
                </div>
                <span className="home-command-example">{command.example}</span>
                <span className="home-command-arrow" aria-hidden="true">
                  ↗
                </span>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="home-cta home-section" id="start">
          <div className="home-cta-copy">
            <div className="home-section-title">
              <span className="home-section-number" aria-hidden="true">03</span>
              <h2>
                Cuộc vui bắt đầu
                <br />
                <em>từ đây.</em>
              </h2>
            </div>
            <p>
              Vào voice channel của bạn, nhập <code>/play</code> cùng tên bài hát và để bot lo phần
              còn lại.
            </p>
            <a href="/login" className="home-button cta-button">
              Đến trang quản trị <Icon name="arrow" size={17} />
            </a>
          </div>
          <div className="home-cta-art" aria-hidden="true">
            <div className="home-cta-circle">
              <Icon name="bot" size={58} />
            </div>
            <span>THINGS SOUND BETTER TOGETHER</span>
          </div>
        </section>
      </main>
      <footer className="home-footer">
        <a href="/" className="home-footer-brand">
          <span className="home-brand-mark">
            <Icon name="bot" size={17} />
          </span>
          Discord Control
        </a>
        <span>ĐƯỢC TẠO CHO NHỮNG KẾT NỐI THỰC SỰ</span>
        <a href="/login">Trang quản trị ↗</a>
      </footer>
    </div>
  );
}
