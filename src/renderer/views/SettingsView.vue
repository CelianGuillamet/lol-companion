<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import QRCode from 'qrcode';
import { state } from '../store';
import type { Settings } from '../../core/types';
import PageHeader from '../ui/PageHeader.vue';
import Notice from '../ui/Notice.vue';

const s = computed(() => state.value!);
const refreshing = ref(false);

const OPTIONS: { key: 'autoRunes' | 'autoSpells' | 'autoItemSet' | 'overlay' | 'notifications' | 'autoAccept' | 'augmentNotify' | 'secondOnTop' | 'readCards'; label: string; hint: string }[] = [
  { key: 'readCards', label: 'Lire les cartes d’augments à l’écran (Mayhem)', hint: 'Reconnaît tes 3 cartes et met la meilleure en avant, avec une notification « Prends … ». Seulement quand des cartes peuvent être proposées. L’image est lue puis effacée : rien n’est gardé ni envoyé. ⌘⇧R : relire maintenant.' },
  { key: 'autoRunes', label: 'Importer les runes', hint: 'Faille : la page la plus jouée sur OP.GG pour ton rôle. ARAM / Mayhem : la page recommandée par le client. Écrite dans une page « ARAM Companion » (tes autres pages ne sont pas touchées).' },
  { key: 'autoSpells', label: 'Importer les sorts', hint: 'Faille : les sorts les plus joués pour ton rôle (OP.GG). Mayhem : les plus gagnants du champion. ARAM : Flash + Marque. Ton placement D/F est conservé.' },
  { key: 'autoItemSet', label: 'Créer un item set (Mayhem)', hint: 'Ajoute un set « ARAM Companion » avec les items les plus gagnants. Tes sets existants sont conservés.' },
  { key: 'overlay', label: 'Panneau en jeu', hint: 'Augments et build pendant la partie. ⌘⇧A : masquer / afficher · ⌘⇧M : écran suivant · ⌘⇧S : fenêtre second écran.' },
  { key: 'autoAccept', label: 'Accepter la partie automatiquement', hint: 'Files prises en charge : ARAM, Mayhem et Faille (classée comprise). Désactivé par défaut.' },
  { key: 'secondOnTop', label: 'Fenêtre en jeu au premier plan', hint: 'Pour jouer en fenêtré sur un seul écran : la fenêtre en jeu (⌘⇧S) reste par-dessus. Réduis-la à côté du jeu.' },
  { key: 'augmentNotify', label: 'Notification aux choix d’augments (Mayhem)', hint: 'Aux niveaux 7, 11 et 15 : le meilleur augment de chaque rareté pour ce choix, sans son. Désactivé par défaut.' },
  { key: 'notifications', label: 'Notifications (champ select et fin de partie)', hint: 'Prévient quand tes cartes sont à choisir, quand un meilleur champion arrive sur le banc, et donne ton bilan en fin de partie.' },
];

const pick = (...keys: (typeof OPTIONS)[number]['key'][]) => OPTIONS.filter((o) => keys.includes(o.key));
const GAME = pick('readCards', 'overlay', 'secondOnTop');
const SELECT = pick('autoRunes', 'autoSpells', 'autoItemSet', 'autoAccept');
const NOTIF = pick('notifications', 'augmentNotify');

function toggle(key: (typeof OPTIONS)[number]['key']) {
  void window.api.setSettings({ [key]: !s.value.settings[key] });
}

const phone = ref<{ running: boolean; url: string | null; error: string | null } | null>(null);
const qr = ref<string | null>(null);
async function refreshPhone() {
  phone.value = await window.api.phoneInfo();
  qr.value = phone.value.url ? await QRCode.toDataURL(phone.value.url, { margin: 1, width: 180, color: { dark: '#0b0e14', light: '#e8e2d4' } }) : null;
}
async function togglePhone() {
  await window.api.setSettings({ phone: !s.value.settings.phone });
  await refreshPhone();
}
onMounted(refreshPhone);

const displays = ref<{ id: string; label: string }[]>([]);
const testMsg = ref<{ ok: boolean; text: string } | null>(null);
onMounted(async () => (displays.value = await window.api.listDisplays()));

function setDisplay(e: Event) {
  void window.api.setSettings({ overlayDisplay: (e.target as HTMLSelectElement).value } as Partial<Settings>);
}

function setAutoLaunch(e: Event) {
  void window.api.setSettings({ autoLaunch: (e.target as HTMLSelectElement).value as Settings['autoLaunch'] });
}

function setDensity(e: Event) {
  void window.api.setSettings({ overlayDensity: (e.target as HTMLSelectElement).value as Settings['overlayDensity'] });
}

function setMode(e: Event) {
  void window.api.setSettings({ panelMode: (e.target as HTMLSelectElement).value as Settings['panelMode'] });
}

async function testOverlay() {
  testMsg.value = null;
  const r = await window.api.testOverlay();
  testMsg.value = { ok: r.ok, text: r.message };
}

const cardPerm = ref<string>('');
const cardMsg = ref<string | null>(null);
const cardBusy = ref(false);
onMounted(async () => (cardPerm.value = (await window.api.cardReader()).permission));
async function permAction(a: 'request' | 'settings') {
  cardBusy.value = true;
  const r = await window.api.cardReader(a);
  cardPerm.value = r.permission;
  cardMsg.value = r.message;
  cardBusy.value = false;
}
async function testCards() {
  cardBusy.value = true;
  cardMsg.value = null;
  const r = await window.api.cardReader(true);
  cardPerm.value = r.permission;
  cardMsg.value = r.message;
  cardBusy.value = false;
}
const PERM: Record<string, string> = { granted: 'autorisée', denied: 'non autorisée', 'not-determined': 'pas encore demandée', restricted: 'bloquée', unsupported: 'macOS uniquement', phone: '' };

async function refresh() {
  refreshing.value = true;
  await window.api.refreshData();
  refreshing.value = false;
}

// Données anciennes : le patch du client et celui des stats ne correspondent pas
const stale = computed(() => {
  const c = state.value?.data.clientPatch;
  const p = state.value?.data.patch;
  return !!c && !!p && !c.startsWith(p) && !p.startsWith(c);
});
const time = (ms: number) => new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
</script>

<template>
  <div class="page wrap">
    <PageHeader title="Réglages" sub="Ce que l’app fait pendant la partie, au champ select et en dehors. Les changements s’appliquent tout de suite." />

    <section class="card">
      <h2>Pendant la partie</h2>

      <div class="row2 mode">
        <label class="faint small" for="pmode">Affichage</label>
        <select id="pmode" class="select" :value="s.settings.panelMode" @change="setMode">
          <option value="window">Fenêtre sur un autre écran (recommandé avec plusieurs écrans)</option>
          <option value="overlay">Panneau par-dessus le jeu</option>
        </select>
      </div>
      <div v-if="s.settings.panelMode === 'overlay'" class="row2 mode">
        <label class="faint small" for="dens">Densité</label>
        <select id="dens" class="select" :value="s.settings.overlayDensity" @change="setDensity">
          <option value="full">Complet : cartes ou augments, achat, menaces d’en face</option>
          <option value="compact">Compact : cartes ou augments et achat</option>
          <option value="minimal">Minimal : une seule ligne (meilleure carte, sinon prochain achat)</option>
        </select>
      </div>
      <div class="row2">
        <label class="faint small" for="disp">Écran</label>
        <select id="disp" class="select" :value="s.settings.overlayDisplay" @change="setDisplay">
          <option value="auto">{{ s.settings.panelMode === 'window' ? 'Automatique (un autre écran que le jeu)' : 'Automatique (écran du jeu)' }}</option>
          <option v-for="d in displays" :key="d.id" :value="d.id">{{ d.label }}</option>
        </select>
        <button class="btn" @click="testOverlay">Tester</button>
      </div>
      <p v-if="testMsg" class="small" :class="testMsg.ok ? 'good' : 'bad'">{{ testMsg.text }}</p>
      <p class="faint small">{{ displays.length }} écran(s) détecté(s). Le test affiche le panneau 15 secondes.</p>
      <label v-for="o in GAME" :key="o.key" class="opt">
        <input type="checkbox" :checked="s.settings[o.key]" @change="toggle(o.key)" />
        <div>
          <div>{{ o.label }}</div>
          <div class="faint small">{{ o.hint }}</div>
        </div>
      </label>
      <div v-if="s.settings.readCards" class="perm">
        <div class="perm-head">
          <span class="small">Enregistrement de l’écran (lecture des cartes)</span>
          <span class="chip" :class="cardPerm === 'granted' ? 'ok' : cardPerm === 'unsupported' ? '' : 'warn'">{{ cardPerm === 'granted' ? '✓ ' : '' }}{{ PERM[cardPerm] ?? cardPerm }}</span>
        </div>
        <Notice v-if="cardPerm === 'unsupported'" kind="empty"><p>La lecture des cartes utilise la reconnaissance de texte de macOS : indisponible sur ce système.</p></Notice>
        <div v-else class="row2 btns">
          <button v-if="cardPerm !== 'granted'" class="btn primary" :disabled="cardBusy" @click="permAction('request')">Demander l’autorisation</button>
          <button v-if="cardPerm !== 'granted'" class="btn" :disabled="cardBusy" @click="permAction('settings')">Ouvrir les Réglages Système</button>
          <button class="btn" :disabled="cardBusy" @click="testCards">{{ cardBusy ? 'Lecture…' : 'Tester la lecture' }}</button>
        </div>
      </div>
      <p v-if="cardMsg" class="small">{{ cardMsg }}</p>
    </section>

    <section class="card">
      <h2>Au champ select</h2>
      <label v-for="o in SELECT" :key="o.key" class="opt">
        <input type="checkbox" :checked="s.settings[o.key]" @change="toggle(o.key)" />
        <div>
          <div>{{ o.label }}</div>
          <div class="faint small">{{ o.hint }}</div>
        </div>
      </label>
    </section>

    <section class="card">
      <h2>Notifications</h2>
      <label v-for="o in NOTIF" :key="o.key" class="opt">
        <input type="checkbox" :checked="s.settings[o.key]" @change="toggle(o.key)" />
        <div>
          <div>{{ o.label }}</div>
          <div class="faint small">{{ o.hint }}</div>
        </div>
      </label>
    </section>

    <section class="card">
      <h2>Lancement automatique</h2>
      <div class="row2">
        <select class="select" :value="s.settings.autoLaunch" @change="setAutoLaunch">
          <option value="off">Non (tu lances l’app toi-même)</option>
          <option value="league">Quand le client League démarre (recommandé)</option>
          <option value="login">À l’ouverture de ta session Mac</option>
        </select>
      </div>
      <p class="faint small">Un agent macOS (launchd) ouvre ARAM Companion en arrière-plan. Si l’app est déjà ouverte, rien ne change.</p>
    </section>

    <section class="card">
      <h2>Sur ton téléphone ou ta tablette</h2>
      <label class="opt">
        <input type="checkbox" :checked="s.settings.phone" @change="togglePhone" />
        <div>
          <div>Afficher le panneau en jeu sur un autre appareil</div>
          <div class="faint small">
            Pratique avec un seul écran : le jeu en plein écran ne peut pas le cacher. Même Wi-Fi que le Mac, lecture
            seule, protégé par un jeton dans l’adresse. macOS peut demander d’autoriser les connexions entrantes.
          </div>
        </div>
      </label>
      <div v-if="s.settings.phone" class="phone">
        <img v-if="qr" :src="qr" width="150" height="150" alt="QR code" />
        <div>
          <div v-if="phone?.url" class="small">Scanne le QR code ou ouvre : <span class="mono">{{ phone.url }}</span></div>
          <div v-else-if="phone?.error" class="bad small">{{ phone.error }}</div>
          <div v-else class="faint small">Aucun réseau local détecté.</div>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>Données globales</h2>
      <div class="data">
        <div>
          <div v-if="s.data.patch">arammeta · patch {{ s.data.patch }} · chargées à {{ time(s.data.loadedAt!) }}</div>
          <div v-if="s.data.error" class="bad small">{{ s.data.error }}</div>
          <Notice v-if="stale" kind="warn"><p>Client en {{ s.data.clientPatch }} : les stats Mayhem sont encore celles du {{ s.data.patch }}. Elles se mettent à jour quelques jours après un patch.</p></Notice>
          <div v-if="s.data.balance" class="small">Équilibrage ARAM : {{ s.data.balance }}</div>
          <div class="faint small">Mises en cache 12 h. Les augments Mayhem changent souvent : rafraîchis après un patch.</div>
        </div>
        <button class="btn" :disabled="refreshing" @click="refresh">{{ refreshing ? 'Chargement…' : 'Rafraîchir' }}</button>
      </div>
    </section>

    <section class="card">
      <h2>Journal</h2>
      <div v-if="!s.log.length" class="faint small">Rien pour l’instant.</div>
      <div v-for="l in s.log" :key="l.at + l.text" class="log">
        <span class="faint num">{{ time(l.at) }}</span>
        <span :class="l.level === 'warning' ? 'bad' : l.level === 'success' ? 'good' : ''">{{ l.text }}</span>
      </div>
    </section>
  </div>
</template>

<style scoped>
.wrap { max-width: 820px; }
h2 { font-size: var(--fs-lg); margin-bottom: 10px; }
.card { padding: 16px 18px; }
.small { font-size: 12px; }
.opt { display: grid; grid-template-columns: 18px 1fr; gap: 10px; padding: 10px 0; border-top: 1px solid var(--border); cursor: pointer; }
.opt:first-of-type { border-top: 0; }
.opt input { accent-color: var(--gold); margin-top: 3px; }
.data { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.row2 { display: flex; gap: 10px; align-items: center; }
.row2.mode { margin-bottom: 10px; }
.row2 label { width: 70px; flex: none; }
.row2 .select { flex: 1; min-width: 0; }
.perm { display: flex; flex-direction: column; gap: 8px; padding-top: 10px; border-top: 1px solid var(--border); }
.perm-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.chip.ok { color: var(--good); border-color: rgba(63, 208, 181, 0.4); }
.btns { flex-wrap: wrap; }
.phone { display: flex; gap: 14px; align-items: center; padding-top: 10px; }
.phone img { border-radius: var(--radius); }
.mono { font-family: ui-monospace, Menlo, monospace; user-select: all; word-break: break-all; }
.log { display: grid; grid-template-columns: 46px 1fr; gap: 8px; font-size: 13px; padding: 4px 0; }
</style>
