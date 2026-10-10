import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "../public/marketing");

const frame = (background, content) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="720" viewBox="0 0 560 360">
  <rect width="560" height="360" rx="26" fill="${background}" />
  ${content}
</svg>`;

const sourceCards = {
  movies: frame(
    "#141b35",
    `<text x="36" y="48" fill="#9bb0d5" font-size="17" font-family="Arial" letter-spacing="2">MOVIE WATCHLIST</text>
     <rect x="36" y="72" width="188" height="244" rx="18" fill="#e7a36d" />
     <rect x="51" y="89" width="158" height="212" rx="12" fill="#754e71" />
     <circle cx="130" cy="171" r="48" fill="#f5ce88" opacity=".92" />
     <path d="M75 262 Q128 198 185 265 L185 286 L75 286Z" fill="#263452" />
     <text x="254" y="125" fill="#ffffff" font-size="31" font-family="Arial" font-weight="700">A quieter kind</text>
     <text x="254" y="166" fill="#ffffff" font-size="31" font-family="Arial" font-weight="700">of science fiction</text>
     <text x="254" y="214" fill="#b9c4da" font-size="19" font-family="Arial">Five films to come back to</text>
     <rect x="254" y="245" width="180" height="39" rx="19" fill="#273657" />
     <text x="274" y="270" fill="#dce7ff" font-size="16" font-family="Arial">WATCHLIST · 5 ITEMS</text>`,
  ),
  wishlist: frame(
    "#fff4e7",
    `<text x="36" y="48" fill="#916748" font-size="17" font-family="Arial" letter-spacing="2">WISHLIST</text>
     <text x="36" y="102" fill="#282a35" font-size="32" font-family="Arial" font-weight="700">Small things, well made</text>
     <rect x="36" y="128" width="148" height="180" rx="18" fill="#f6ddc2" />
     <path d="M78 236 Q110 183 145 236 L145 270 L78 270Z" fill="#6f8a73" />
     <ellipse cx="111" cy="232" rx="37" ry="12" fill="#c8774e" />
     <rect x="204" y="128" width="148" height="180" rx="18" fill="#f3d6d7" />
     <path d="M251 170 L305 170 L317 260 L239 260Z" fill="#df9c57" />
     <path d="M266 173 Q278 140 290 173" fill="none" stroke="#8d623f" stroke-width="8" />
     <rect x="372" y="128" width="152" height="180" rx="18" fill="#dcebe3" />
     <rect x="404" y="174" width="87" height="72" rx="10" fill="#879e9b" />
     <path d="M412 231 L435 205 L451 221 L470 195 L484 231Z" fill="#f4d4a4" />
     <text x="37" y="336" fill="#6d6257" font-size="17" font-family="Arial">A home list, kept together</text>`,
  ),
  places: frame(
    "#e7f2ef",
    `<text x="36" y="48" fill="#4d7771" font-size="17" font-family="Arial" letter-spacing="2">PLACES TO GO</text>
     <rect x="36" y="72" width="488" height="242" rx="20" fill="#d4e5db" />
     <path d="M36 145 C126 102 184 176 280 128 S433 123 524 91 M36 259 C130 219 205 277 288 224 S435 214 524 250" fill="none" stroke="#a4c0b3" stroke-width="18" />
     <path d="M146 72 L176 314 M356 72 L326 314" fill="none" stroke="#f7f2df" stroke-width="16" />
     <circle cx="278" cy="190" r="36" fill="#e16e53" />
     <path d="M278 249 C252 215 243 203 243 185 A35 35 0 1 1 313 185 C313 203 304 215 278 249Z" fill="#dd614b" />
     <circle cx="278" cy="184" r="12" fill="#fff8ef" />
     <rect x="55" y="91" width="183" height="54" rx="14" fill="#ffffff" />
     <text x="74" y="124" fill="#23463f" font-size="20" font-family="Arial" font-weight="700">A weekend by the sea</text>
     <text x="57" y="344" fill="#53736b" font-size="17" font-family="Arial">Saved stays and places, ready to revisit</text>`,
  ),
  career: frame(
    "#f4e9ed",
    `<text x="36" y="48" fill="#986878" font-size="17" font-family="Arial" letter-spacing="2">CAREER NOTES</text>
     <rect x="36" y="72" width="488" height="242" rx="20" fill="#fffaf7" />
     <circle cx="84" cy="120" r="24" fill="#d98e7e" />
     <path d="M45 185 Q84 144 123 185 L123 199 L45 199Z" fill="#778e9d" />
     <text x="127" y="125" fill="#312b35" font-size="19" font-family="Arial" font-weight="700">A note worth keeping</text>
     <text x="127" y="153" fill="#8b7f87" font-size="15" font-family="Arial">CAREER ADVICE · 3 MIN READ</text>
     <text x="64" y="239" fill="#3e3340" font-size="24" font-family="Arial" font-weight="700">“Make the next step small</text>
     <text x="64" y="272" fill="#3e3340" font-size="24" font-family="Arial" font-weight="700">enough to actually take.”</text>
     <text x="37" y="344" fill="#806b77" font-size="17" font-family="Arial">A social post, saved with its context</text>`,
  ),
  engineering: frame(
    "#e8edf5",
    `<text x="36" y="48" fill="#617799" font-size="17" font-family="Arial" letter-spacing="2">ENGINEERING READING</text>
     <rect x="36" y="72" width="488" height="242" rx="20" fill="#17243a" />
     <circle cx="67" cy="103" r="7" fill="#eb806d" /><circle cx="91" cy="103" r="7" fill="#e9c878" /><circle cx="115" cy="103" r="7" fill="#82c7a1" />
     <text x="62" y="159" fill="#d9e4fb" font-size="25" font-family="Arial" font-weight="700">How a small system</text>
     <text x="62" y="192" fill="#d9e4fb" font-size="25" font-family="Arial" font-weight="700">stays understandable</text>
     <rect x="62" y="220" width="306" height="9" rx="4" fill="#6f91c2" />
     <rect x="62" y="241" width="390" height="9" rx="4" fill="#415b7c" />
     <rect x="62" y="262" width="268" height="9" rx="4" fill="#415b7c" />
     <text x="38" y="344" fill="#60728e" font-size="17" font-family="Arial">An article for the next deep dive</text>`,
  ),
  "ui-reference": frame(
    "#e8f0ff",
    `<text x="36" y="48" fill="#5f78a6" font-size="17" font-family="Arial" letter-spacing="2">UI REFERENCES</text>
     <rect x="36" y="72" width="488" height="242" rx="20" fill="#ffffff" />
     <rect x="57" y="91" width="446" height="31" rx="10" fill="#f2f5fb" />
     <circle cx="75" cy="107" r="5" fill="#99a8c2" />
     <rect x="92" y="102" width="116" height="9" rx="4" fill="#c8d3e8" />
     <rect x="57" y="142" width="120" height="145" rx="13" fill="#263c66" />
     <rect x="193" y="142" width="145" height="65" rx="13" fill="#f4d8bc" />
     <rect x="354" y="142" width="149" height="65" rx="13" fill="#d8eee4" />
     <rect x="193" y="222" width="310" height="65" rx="13" fill="#eef1f8" />
     <rect x="211" y="242" width="112" height="9" rx="4" fill="#8f9cb4" />
     <rect x="211" y="259" width="210" height="7" rx="3" fill="#c4ccda" />
     <text x="37" y="344" fill="#61749a" font-size="17" font-family="Arial">A layout detail, kept for later</text>`,
  ),
  "course-material": frame(
    "#f8edce",
    `<text x="36" y="48" fill="#987b35" font-size="17" font-family="Arial" letter-spacing="2">COURSE MATERIAL</text>
     <rect x="36" y="72" width="488" height="242" rx="20" fill="#fffaf0" />
     <rect x="66" y="96" width="170" height="192" rx="14" fill="#e3a445" />
     <rect x="83" y="114" width="136" height="156" rx="8" fill="#fff9eb" />
     <rect x="101" y="140" width="100" height="11" rx="5" fill="#566c68" />
     <rect x="101" y="165" width="89" height="7" rx="3" fill="#c5c9bf" />
     <rect x="101" y="180" width="99" height="7" rx="3" fill="#c5c9bf" />
     <rect x="101" y="195" width="77" height="7" rx="3" fill="#c5c9bf" />
     <rect x="263" y="103" width="88" height="64" rx="11" fill="#dcebe6" />
     <rect x="362" y="103" width="127" height="64" rx="11" fill="#eff1f4" />
     <text x="270" y="143" fill="#56746b" font-size="18" font-family="Arial" font-weight="700">PDF · 18p</text>
     <text x="263" y="216" fill="#302b25" font-size="25" font-family="Arial" font-weight="700">Database systems</text>
     <text x="263" y="249" fill="#776d5f" font-size="18" font-family="Arial">Lecture slides · week 04</text>
     <text x="37" y="344" fill="#8b753f" font-size="17" font-family="Arial">Course files alongside everything else</text>`,
  ),
};

const posters = {
  "save-from-anywhere": frame(
    "#e8f2eb",
    `<rect x="64" y="72" width="432" height="216" rx="20" fill="#ffffff" />
     <rect x="88" y="98" width="384" height="43" rx="12" fill="#f3f5f8" />
     <circle cx="110" cy="119" r="6" fill="#9ca9ba" />
     <rect x="129" y="114" width="220" height="10" rx="5" fill="#c3ccd8" />
     <rect x="88" y="164" width="106" height="100" rx="12" fill="#e2ebf7" />
     <rect x="211" y="171" width="178" height="13" rx="6" fill="#415779" />
     <rect x="211" y="196" width="229" height="9" rx="4" fill="#c7d0de" />
     <rect x="211" y="216" width="194" height="9" rx="4" fill="#c7d0de" />
     <circle cx="421" cy="242" r="26" fill="#1e8b63" />
     <path d="M409 242 L418 251 L434 232" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
     <text x="65" y="334" fill="#274436" font-size="24" font-family="Arial" font-weight="700">Save something for later</text>`,
  ),
  "keep-the-context": frame(
    "#eaf0f7",
    `<rect x="67" y="56" width="426" height="248" rx="20" fill="#ffffff" />
     <rect x="87" y="76" width="136" height="127" rx="13" fill="#25415a" />
     <circle cx="155" cy="130" r="40" fill="#d9b47d" />
     <path d="M102 187 Q150 132 207 185 L207 196 L102 196Z" fill="#4a6f80" />
     <rect x="244" y="83" width="207" height="14" rx="7" fill="#394b65" />
     <rect x="244" y="110" width="166" height="9" rx="4" fill="#c5cfdb" />
     <rect x="244" y="129" width="194" height="9" rx="4" fill="#c5cfdb" />
     <rect x="87" y="220" width="85" height="27" rx="13" fill="#e8f0ed" />
     <rect x="181" y="220" width="101" height="27" rx="13" fill="#edf0f7" />
     <rect x="291" y="220" width="122" height="27" rx="13" fill="#f6eee2" />
     <text x="68" y="341" fill="#32465c" font-size="24" font-family="Arial" font-weight="700">Keep the useful details together</text>`,
  ),
  "rediscover-it": frame(
    "#eef0fb",
    `<rect x="61" y="55" width="438" height="249" rx="20" fill="#ffffff" />
     <rect x="85" y="78" width="389" height="45" rx="14" fill="#f2f4fa" />
     <circle cx="109" cy="100" r="8" fill="none" stroke="#7b88a0" stroke-width="3" />
     <path d="M115 106 L122 113" stroke="#7b88a0" stroke-width="3" stroke-linecap="round" />
     <rect x="136" y="96" width="219" height="9" rx="4" fill="#aeb8cb" />
     <rect x="85" y="143" width="130" height="126" rx="14" fill="#dcebe5" />
     <rect x="236" y="150" width="210" height="13" rx="6" fill="#455875" />
     <rect x="236" y="177" width="179" height="9" rx="4" fill="#c8d0df" />
     <rect x="236" y="197" width="193" height="9" rx="4" fill="#c8d0df" />
     <rect x="236" y="223" width="92" height="25" rx="12" fill="#e7eef0" />
     <text x="62" y="341" fill="#414c69" font-size="24" font-family="Arial" font-weight="700">Find it when you need it again</text>`,
  ),
  "mobile-library": frame(
    "#e9f0f5",
    `<rect x="187" y="24" width="186" height="310" rx="31" fill="#1b2435" />
     <rect x="197" y="36" width="166" height="286" rx="23" fill="#fbfcfd" />
     <rect x="251" y="44" width="58" height="9" rx="5" fill="#1b2435" />
     <text x="216" y="89" fill="#17243a" font-size="22" font-family="Arial" font-weight="700">Your library</text>
     <rect x="212" y="105" width="136" height="75" rx="11" fill="#dfebde" />
     <rect x="222" y="115" width="42" height="54" rx="7" fill="#315e51" />
     <rect x="273" y="119" width="63" height="9" rx="4" fill="#445875" />
     <rect x="273" y="136" width="51" height="7" rx="3" fill="#abb5c3" />
     <rect x="273" y="150" width="61" height="7" rx="3" fill="#abb5c3" />
     <rect x="212" y="190" width="136" height="75" rx="11" fill="#f7ead9" />
     <rect x="222" y="200" width="42" height="54" rx="7" fill="#d48e54" />
     <rect x="273" y="204" width="63" height="9" rx="4" fill="#445875" />
     <rect x="273" y="221" width="51" height="7" rx="3" fill="#abb5c3" />
     <rect x="273" y="235" width="61" height="7" rx="3" fill="#abb5c3" />
     <text x="80" y="349" fill="#33465a" font-size="22" font-family="Arial" font-weight="700">The library comes with you</text>`,
  ),
};

async function writeAssets(group, entries) {
  for (const [name, svg] of Object.entries(entries)) {
    const directory = path.join(root, group);
    await mkdir(directory, { recursive: true });
    await sharp(Buffer.from(svg))
      .webp({ quality: 86, effort: 5 })
      .toFile(path.join(directory, `${name}.webp`));
  }
}

await writeAssets("source-cards", sourceCards);
await writeAssets("posters", posters);
console.log(
  `Generated ${Object.keys(sourceCards).length} source cards and ${Object.keys(posters).length} illustrative poster placeholders.`,
);
