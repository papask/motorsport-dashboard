import PageMasthead from '../components/PageMasthead';
import { useLang } from '../i18n';

// Shown on the page only when set. AdSense reviewers look for a way to reach the operator.
const CONTACT_EMAIL = '';
const UPDATED = '2026-09-25';

// Long-form legal copy lives here per language rather than in messages.ts.
const COPY = {
  ko: {
    title: '개인정보처리방침',
    sections: [
      ['수집하는 정보', '온더리밋은 회원가입이 없으며 이름, 이메일 등 개인을 직접 식별하는 정보를 수집하지 않습니다. 언어·테마 설정은 사용자의 브라우저(localStorage)에만 저장됩니다.'],
      ['분석 도구', '서비스 개선을 위해 Google Analytics 4와 Microsoft Clarity를 사용합니다. 이 도구들은 쿠키 등을 통해 방문 페이지, 기기·브라우저 정보, 대략적인 위치, 클릭·스크롤 같은 이용 정보를 익명으로 수집합니다.'],
      ['광고', '이 사이트는 Google AdSense를 통해 광고를 게재할 수 있습니다. Google을 포함한 제3자 공급업체는 쿠키를 사용하여 사용자의 이 사이트 또는 다른 웹사이트 방문 기록을 바탕으로 광고를 게재합니다. Google은 광고 쿠키를 사용하여 사용자의 방문 기록에 기반한 맞춤 광고를 제공합니다.'],
      ['선택권', '맞춤 광고는 Google 광고 설정(adssettings.google.com)에서 해제할 수 있으며, 제3자 공급업체의 쿠키는 www.aboutads.info에서 해제할 수 있습니다. 브라우저 설정에서 쿠키를 차단하거나 삭제할 수도 있습니다.'],
      ['외부 데이터', '레이스 데이터와 FiA 문서는 공개된 외부 출처에서 가져오며, 이 과정에서 사용자 정보는 전송되지 않습니다.'],
    ],
    contact: '문의',
    updated: '최종 수정일',
  },
  en: {
    title: 'Privacy Policy',
    sections: [
      ['What we collect', 'On The Limit has no accounts and does not collect information that directly identifies you, such as your name or email. Language and theme preferences are stored only in your browser (localStorage).'],
      ['Analytics', 'We use Google Analytics 4 and Microsoft Clarity to improve the service. These tools use cookies and similar technologies to collect anonymous usage data such as pages visited, device and browser details, approximate location, and clicks and scrolls.'],
      ['Advertising', 'This site may show ads through Google AdSense. Third-party vendors, including Google, use cookies to serve ads based on your prior visits to this site or other websites. Google’s use of advertising cookies enables it and its partners to serve ads based on your visits to this and other sites.'],
      ['Your choices', 'You can opt out of personalized advertising in Google Ads Settings (adssettings.google.com), and out of third-party vendor cookies at www.aboutads.info. You can also block or delete cookies in your browser settings.'],
      ['External data', 'Race data and FiA documents come from public external sources; no information about you is sent in the process.'],
    ],
    contact: 'Contact',
    updated: 'Last updated',
  },
};

export default function Privacy() {
  const { lang } = useLang();
  const c = COPY[lang];
  return (
    <div className="page-container privacy-page">
      <PageMasthead title={c.title} subtitle={`${c.updated} ${UPDATED}`} />
      {c.sections.map(([h, body]) => (
        <section key={h}>
          <h2>{h}</h2>
          <p>{body}</p>
        </section>
      ))}
      {CONTACT_EMAIL && (
        <section>
          <h2>{c.contact}</h2>
          <p><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
        </section>
      )}
    </div>
  );
}
