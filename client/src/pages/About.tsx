import PageMasthead from '../components/PageMasthead';
import { useLang } from '../i18n';
import { CONTACT_EMAIL } from './Privacy';

// Long-form copy lives here per language rather than in messages.ts, like Privacy.
const COPY = {
  ko: {
    title: '온더리밋 소개',
    sections: [
      ['어떤 사이트인가요', '온더리밋은 한국 F1 팬을 위한 레이스 데이터·분석 사이트입니다. 해외 중계와 기사로 흩어져 있는 F1 정보를 한국 시간과 한국어로 한곳에 모아, 레이스 주말을 따라가고 지난 경기를 되짚기 쉽게 만드는 것이 목표입니다.'],
      ['무엇을 볼 수 있나요', '시즌 일정과 세션 시간(한국 시간), 드라이버·컨스트럭터 챔피언십 순위와 라운드별 변화, 그랑프리별 레이스·예선·스프린트 결과, 랩별 순위 변동 타임라인, 드라이버 간 텔레메트리 비교, 레이스 컨트롤 메시지로 본 인시던트 기록을 제공합니다. 그랑프리 주간에는 서킷 역대 기록과 지난 대회 결과, 폴 랩으로 본 서킷 특성을 모은 다음 경기 가이드가 열립니다.'],
      ['데이터는 어디서 오나요', '레이스 결과와 순위는 Jolpica F1 API, 텔레메트리와 레이스 컨트롤 기록은 오픈소스 라이브러리 FastF1에서 가져옵니다. FiA 문서는 FiA 공식 사이트에 공개된 문서를 가져와 AI로 한국어 요약을 만들고, 모든 요약에 원문 링크를 함께 둡니다.'],
      ['AI 요약에 대해', 'FiA 문서 요약은 Anthropic의 Claude로 작성합니다. 요약은 원문을 대신하지 않으며, 페널티 내용 등 정확한 판단이 필요할 때는 원문을 확인해 주세요. 잘못된 요약을 발견하면 아래 문의처로 알려 주시면 바로 고칩니다.'],
      ['운영', '온더리밋은 F1을 좋아하는 개인이 운영하는 비공식 팬 사이트로, Formula 1, FIA 및 각 팀과 관련이 없습니다. F1, FORMULA 1 등의 상표는 Formula One Licensing B.V.의 소유입니다.'],
    ],
    contact: '문의',
  },
  en: {
    title: 'About On The Limit',
    sections: [
      ['What this is', 'On The Limit is a race data and analysis site for Korean F1 fans. It gathers F1 information that is otherwise spread across overseas broadcasts and articles into one place, in Korean time and in Korean, so race weekends are easier to follow and past races easier to revisit.'],
      ['What you can find', 'The season calendar and session times, driver and constructor championship standings with round-by-round changes, race, qualifying and sprint results, lap-by-lap position timelines, driver-to-driver telemetry comparisons, and incident records from race control messages. During a race week a next-race guide opens with the circuit’s history, last year’s results and its character read from the pole lap.'],
      ['Where the data comes from', 'Results and standings come from the Jolpica F1 API; telemetry and race control records from the open-source FastF1 library. FiA documents are taken from the FiA’s public site and summarized in Korean with AI, each summary linking to its original.'],
      ['About the AI summaries', 'FiA document summaries are written with Anthropic’s Claude. They do not replace the originals; check the original when precision matters, such as a penalty’s terms. If you find a wrong summary, let us know at the contact below and it will be fixed.'],
      ['Who runs it', 'On The Limit is an unofficial fan site run by an individual F1 fan and is not associated with Formula 1, the FIA or any team. F1 and FORMULA 1 are trademarks of Formula One Licensing B.V.'],
    ],
    contact: 'Contact',
  },
};

export default function About() {
  const { lang } = useLang();
  const c = COPY[lang];
  return (
    <div className="page-container privacy-page">
      <PageMasthead title={c.title} />
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
