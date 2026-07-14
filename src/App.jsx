import { useState, useEffect } from 'react'
import { supabase } from './supabase'

function App() {
  const [igraci, setIgraci] = useState([])
  const [odabraniIgrac, setOdabraniIgrac] = useState('')
  const [prognoza, setPrognoza] = useState('')
  const [koristiDzoker, setKoristiDzoker] = useState(false)
  const [aktivnaUtakmica, setAktivnaUtakmica] = useState(null)
  const [svePrognoze, setSvePrognoze] = useState([])
  
  const [pokaziAdmin, setPokaziAdmin] = useState(false)
  const [sluzbeniBroj, setSluzbeniBroj] = useState('')
  const [utakmiceAdmin, setUtakmiceAdmin] = useState([])

  const [aktivniTab, setAktivniTab] = useState('unos')
  const [poredak, setPoredak] = useState([])
  const [statistika, setStatistika] = useState([])
  const [pokaziPravila, setPokaziPravila] = useState(false)

  const [zavrseneUtakmice, setZavrseneUtakmice] = useState([])
  const [odabranaPovijestId, setOdabranaPovijestId] = useState('')
  const [povijestPrognoze, setPovijestPrognoze] = useState([])

  const [ucitavanje, setUcitavanje] = useState(false)

  useEffect(() => {
    fetchIgraci()
    fetchTrenutnaUtakmica()
    fetchPoredak()
    fetchZavrseneUtakmice()
    fetchStatistika()
  }, [])

  useEffect(() => {
    if (odabranaPovijestId) {
      fetchPovijestPrognoze(odabranaPovijestId)
    } else {
      setPovijestPrognoze([])
    }
  }, [odabranaPovijestId])

  async function fetchIgraci() {
    const { data } = await supabase.from('igraci').select('*').order('id', { ascending: true })
    if (data) setIgraci(data)
  }

  async function fetchTrenutnaUtakmica() {
    const { data: otvorena } = await supabase.from('utakmice').select('*').eq('status', 'otvorena').single()
    if (otvorena) {
      setAktivnaUtakmica(otvorena)
      fetchPrognoze(otvorena.id)
    } else {
      const { data: zavrsena } = await supabase.from('utakmice').select('*').eq('status', 'zavrsena').order('id', { ascending: false }).limit(1).single()
      if (zavrsena) {
        setAktivnaUtakmica(zavrsena)
        fetchPrognoze(zavrsena.id)
      } else {
        setAktivnaUtakmica(null)
        setSvePrognoze([])
      }
    }
    
    // Za Spikera - dohvati sve da može otključavati nova kola
    const { data: sveUtakmice } = await supabase.from('utakmice').select('*').order('id', { ascending: true })
    if (sveUtakmice) setUtakmiceAdmin(sveUtakmice)
  }

  async function fetchPrognoze(utakmicaId) {
    const { data } = await supabase.from('prognoze').select('*, igraci(ime)').eq('utakmica_id', utakmicaId).order('vrijeme_unosa', { ascending: false })
    if (data) setSvePrognoze(data)
  }

  async function fetchPoredak() {
    const { data: sviIgraci } = await supabase.from('igraci').select('*')
    const { data: svePrognozeBaza } = await supabase.from('prognoze').select('*')

    if (sviIgraci && svePrognozeBaza) {
      let bodoviZbirno = sviIgraci.map(igrac => {
        let ukupno = 0
        let odigrano = 0
        svePrognozeBaza.forEach(p => {
          if (p.igrac_id === igrac.id && p.bodovi !== null) {
            ukupno += p.bodovi
            odigrano++
          }
        })
        return { ...igrac, ukupno, odigrano }
      })
      bodoviZbirno.sort((a, b) => b.ukupno - a.ukupno)
      setPoredak(bodoviZbirno)
    }
  }

  async function fetchStatistika() {
    const { data: igraciData } = await supabase.from('igraci').select('*');
    const { data: prognozeData } = await supabase.from('prognoze').select('*, utakmice(id, sluzbeni_broj, status)');

    if (igraciData && prognozeData) {
      // 1. Tko je pobijedio u kojem kolu
      const zavrseneIds = [...new Set(prognozeData.filter(p => p.utakmice?.status === 'zavrsena').map(p => p.utakmica_id))];
      const pobjednici = {};
      
      zavrseneIds.forEach(uId => {
        const pZaKolo = prognozeData.filter(p => p.utakmica_id === uId && p.napomena !== 'Nije igrao');
        if (pZaKolo.length > 0) {
          pZaKolo.sort((a,b) => Math.abs(a.broj_gledatelja - a.utakmice.sluzbeni_broj) - Math.abs(b.broj_gledatelja - b.utakmice.sluzbeni_broj));
          pobjednici[uId] = pZaKolo[0].igrac_id;
        }
      });

      // 2. Izračun po igraču
      const stats = igraciData.map(igrac => {
        const moje = prognozeData.filter(p => p.igrac_id === igrac.id && p.utakmice?.status === 'zavrsena');
        let sumaRazlika = 0, odigranoPravih = 0;
        let bSnajper = 0, bProrok = 0, bSpavalica = 0, bHrabro = 0;
        let najbolji = null;

        moje.forEach(p => {
          if (p.napomena === 'Nije igrao') {
            bSpavalica++;
          } else {
            odigranoPravih++;
            const razlika = Math.abs(p.broj_gledatelja - p.utakmice.sluzbeni_broj);
            sumaRazlika += razlika;
            
            if (najbolji === null || razlika < najbolji) najbolji = razlika;
            if (razlika <= 20) bSnajper++;
            if (p.joker && p.bodovi > 0) bHrabro++;
            if (pobjednici[p.utakmica_id] === igrac.id) bProrok++;
          }
        });

        return {
          ...igrac,
          prosjek: odigranoPravih > 0 ? Math.round(sumaRazlika / odigranoPravih) : '-',
          najbolji: najbolji !== null ? najbolji : '-',
          bSnajper, bProrok, bSpavalica, bHrabro
        }
      });

      setStatistika(stats);
    }
  }

  async function fetchZavrseneUtakmice() {
    const { data } = await supabase.from('utakmice').select('*').eq('status', 'zavrsena').order('id', { ascending: false })
    if (data) setZavrseneUtakmice(data)
  }

  async function fetchPovijestPrognoze(utakmicaId) {
    const { data } = await supabase.from('prognoze').select('*, igraci(ime)').eq('utakmica_id', utakmicaId)
    if (data) {
      let sortirano = [...data].sort((a, b) => b.bodovi - a.bodovi)
      setPovijestPrognoze(sortirano)
    }
  }

  const posaljiPrognozu = async () => {
    if (!odabraniIgrac) return alert("Alo, tko si ti? Odaberi proroka iz izbornika!")
    if (!prognoza || prognoza <= 0) return alert("Unesi neki normalan broj gledatelja!")
    if (!aktivnaUtakmica || aktivnaUtakmica.status !== 'otvorena') return alert("Utakmica je zaključana!")

    if (ucitavanje) return;
    setUcitavanje(true);

    const vecUnio = svePrognoze.find(p => p.igrac_id === parseInt(odabraniIgrac))
    if (vecUnio) {
      setUcitavanje(false);
      return alert("Već si unio prognozu za ovu utakmicu, nema varanja!");
    }

    const igracPodaci = igraci.find(i => i.id === parseInt(odabraniIgrac));
    if (koristiDzoker && igracPodaci && igracPodaci.preostali_dzokeri <= 0) {
      setUcitavanje(false);
      return alert("Nemaš više Džokera na raspolaganju! Makni kvačicu.");
    }

    const { error } = await supabase.from('prognoze').insert([{
      igrac_id: odabraniIgrac,
      utakmica_id: aktivnaUtakmica.id,
      broj_gledatelja: parseInt(prognoza),
      joker: koristiDzoker
    }])

    if (error) alert("Greška: " + error.message)
    else {
      setPrognoza(''); setKoristiDzoker(false); setOdabraniIgrac('');
      fetchPrognoze(aktivnaUtakmica.id)
    }
    setUcitavanje(false);
  }

  const zavrsiUtakmicu = async () => {
    if (!sluzbeniBroj) return alert("Unesi službeni broj sa stadiona!")
    
    if (ucitavanje) return;
    setUcitavanje(true);

    const tocanBroj = parseInt(sluzbeniBroj)
    const igraciKojiSuIgraliIds = svePrognoze.map(p => p.igrac_id)
    const igraciKojiNisuIgrali = igraci.filter(i => !igraciKojiSuIgraliIds.includes(i.id))

    let obrada = svePrognoze.map(p => ({ ...p, razlika: Math.abs(p.broj_gledatelja - tocanBroj) }))
    obrada.sort((a, b) => a.razlika - b.razlika)

    for (let i = 0; i < obrada.length; i++) {
      let p = obrada[i]
      let bodovi = 0

      if (i === 0) bodovi += 3
      else if (i === 1) bodovi += 1

      if (p.razlika <= 20) bodovi += 5
      else if (p.razlika <= 100) bodovi += 2

      if (i === obrada.length - 1 && p.razlika >= 800) bodovi -= 1
      if (p.joker) bodovi *= 2

      await supabase.from('prognoze').update({ bodovi: bodovi }).eq('id', p.id)
      
      if (p.joker) {
        const { data: igracData } = await supabase.from('igraci').select('preostali_dzokeri').eq('id', p.igrac_id).single()
        let noviBroj = igracData.preostali_dzokeri - 1;
        if (noviBroj < 0) noviBroj = 0;
        await supabase.from('igraci').update({ preostali_dzokeri: noviBroj }).eq('id', p.igrac_id)
      }
    }

    for (let igrac of igraciKojiNisuIgrali) {
      await supabase.from('prognoze').insert([{
        igrac_id: igrac.id,
        utakmica_id: aktivnaUtakmica.id,
        broj_gledatelja: 0,
        bodovi: -2,
        napomena: 'Nije igrao',
        joker: false
      }])
    }

    await supabase.from('utakmice').update({ status: 'zavrsena', sluzbeni_broj: tocanBroj }).eq('id', aktivnaUtakmica.id)

    alert("Bodovi izračunati! Kazne za neigranje (-2) su dodijeljene.")
    setSluzbeniBroj('')
    setUcitavanje(false);
    
    fetchTrenutnaUtakmica() 
    fetchPoredak()
    fetchZavrseneUtakmice()
    fetchStatistika()
  }

  const otvoriKolo = async (id) => {
    await supabase.from('utakmice').update({ status: 'otvorena' }).eq('id', id)
    alert("Kolo je otvoreno za prognoze!")
    fetchTrenutnaUtakmica()
  }

  const toggleDzoker = () => {
    if (!odabraniIgrac) return alert("Prvo odaberi tko si u padajućem izborniku gore!");
    const igracPodaci = igraci.find(i => i.id === parseInt(odabraniIgrac));
    if (!koristiDzoker && igracPodaci && igracPodaci.preostali_dzokeri <= 0) {
      return alert("Potrošio si sve Džokere 🦈! Nemaš ih više na raspolaganju.");
    }
    setKoristiDzoker(!koristiDzoker);
  }

  const handleIgracPromjena = (e) => {
    setOdabraniIgrac(e.target.value);
    setKoristiDzoker(false);
  }

  return (
    <div className="flex flex-col items-center p-6 pb-20 relative min-h-screen">
      
      <button 
        onClick={() => setPokaziPravila(true)}
        className="absolute top-4 right-4 sm:top-6 sm:right-6 bg-slate-800 border border-slate-600 text-slate-300 px-3 py-1 rounded-full text-sm font-bold shadow-lg hover:bg-slate-700 hover:text-white transition-all z-10"
      >
        Pravila 📜
      </button>

      {pokaziPravila && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setPokaziPravila(false)}>
          <div className="bg-slate-800 border border-sky-600 rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
              <h3 className="text-xl font-bold text-sky-400">Pravila Igre ⚪️🔵</h3>
              <button onClick={() => setPokaziPravila(false)} className="text-slate-400 hover:text-white text-xl font-black">&times;</button>
            </div>
            <div className="text-sm text-slate-300 space-y-3 max-h-[60vh] overflow-y-auto pr-2">
              <p><strong className="text-white">Cilj:</strong> Pogoditi točan broj gledatelja na Rujevici.</p>
              
              <p className="text-sky-300 font-bold mt-2 pt-2 border-t border-slate-700">Plasman:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>1. mjesto (najbliži): <strong className="text-emerald-400">+3 boda</strong></li>
                <li>2. mjesto: <strong className="text-emerald-400">+1 bod</strong></li>
              </ul>

              <p className="text-sky-300 font-bold mt-2 pt-2 border-t border-slate-700">Bonusi:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Snajper (promašaj do 20): <strong className="text-emerald-400">+5 bodova</strong></li>
                <li>Oštro oko (promašaj do 100): <strong className="text-emerald-400">+2 boda</strong></li>
              </ul>

              <p className="text-red-300 font-bold mt-2 pt-2 border-t border-slate-700">Kazne:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Nedolazak (nisi igrao): <strong className="text-red-400">-2 boda</strong></li>
                <li>Zadnji na tablici (uz promašaj preko 800): <strong className="text-red-400">-1 bod</strong></li>
              </ul>

              <p className="text-amber-300 font-bold mt-2 pt-2 border-t border-slate-700">Džoker 🦈 (Sami protiv svih):</p>
              <p>Množi SVE tvoje bodove (i pluseve i minuse) s 2 u tom kolu!</p>
            </div>
            <button onClick={() => setPokaziPravila(false)} className="w-full mt-6 bg-sky-600 text-white font-bold py-2 rounded-xl hover:bg-sky-500">Razumijem!</button>
          </div>
        </div>
      )}

      <header className="mb-6 text-center mt-12 sm:mt-6 w-full max-w-md">
        <h1 className="text-4xl font-extrabold text-sky-400 mb-2 drop-shadow-md">Prorok Rujevice ⚪️🔵</h1>
        
        {/* NAVIGACIJA */}
        <div className="grid grid-cols-4 gap-1 bg-slate-800 rounded-xl p-1 mt-6 border border-slate-700">
          <button onClick={() => setAktivniTab('unos')} className={`py-2 rounded-lg font-bold transition-all text-xs sm:text-sm ${aktivniTab === 'unos' ? 'bg-sky-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>Aktivno</button>
          <button onClick={() => setAktivniTab('povijest')} className={`py-2 rounded-lg font-bold transition-all text-xs sm:text-sm ${aktivniTab === 'povijest' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>Povijest</button>
          <button onClick={() => setAktivniTab('tablica')} className={`py-2 rounded-lg font-bold transition-all text-xs sm:text-sm ${aktivniTab === 'tablica' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>Tablica</button>
          <button onClick={() => setAktivniTab('statistika')} className={`py-2 rounded-lg font-bold transition-all text-xs sm:text-sm ${aktivniTab === 'statistika' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}>Statistika</button>
        </div>
      </header>

      {/* VIEW: AKTIVNO KOLO */}
      {aktivniTab === 'unos' && (
        <div className="w-full flex flex-col items-center">
          {aktivnaUtakmica ? (
            <p className={`font-bold py-1 px-4 rounded-full inline-block mb-6 border ${aktivnaUtakmica.status === 'otvorena' ? 'text-white bg-sky-900/50 border-sky-700' : 'text-emerald-400 bg-emerald-900/50 border-emerald-700'}`}>
              ⚽ {aktivnaUtakmica.naziv} {aktivnaUtakmica.status === 'zavrsena' && '(ZAVRŠENO)'}
            </p>
          ) : <p className="text-slate-400 mb-6 border border-slate-700 bg-slate-800 px-4 py-2 rounded-full">Trenutno nema otvorenih utakmica ⏳</p>}

          {aktivnaUtakmica?.status === 'otvorena' && (
            <main className="w-full max-w-md bg-slate-800 p-8 rounded-2xl shadow-xl border border-slate-700 mb-6">
              <h2 className="text-2xl font-bold mb-6 text-center border-b border-slate-700 pb-4">Unos Prognoze</h2>
              
              <div className="mb-6">
                <label className="block text-slate-400 text-sm mb-2 font-bold uppercase tracking-wider">Tko si ti?</label>
                <select className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:outline-none focus:border-sky-500" value={odabraniIgrac} onChange={handleIgracPromjena}>
                  <option value="">-- Odaberi svog proroka --</option>
                  {igraci.map((igrac) => <option key={igrac.id} value={igrac.id}>{igrac.ime} (Džokera: {igrac.preostali_dzokeri})</option>)}
                </select>
              </div>

              <div className="mb-6">
                <label className="block text-slate-400 text-sm mb-2 font-bold uppercase tracking-wider">Broj gledatelja</label>
                <input type="number" className="w-full bg-slate-900 border border-slate-600 rounded-lg p-4 text-3xl text-center text-white focus:outline-none focus:border-sky-500" placeholder="npr. 6543" value={prognoza} onChange={(e) => setPrognoza(e.target.value)} />
              </div>

              <div className={`mb-8 flex items-center justify-between p-4 rounded-xl cursor-pointer border-2 transition-all ${koristiDzoker ? 'bg-sky-900/40 border-sky-500' : 'bg-slate-900 border-slate-700'}`} onClick={toggleDzoker}>
                <div>
                  <p className={`font-bold ${koristiDzoker ? 'text-sky-400' : 'text-white'}`}>Sami protiv svih (Džoker 🦈)</p>
                </div>
                <div className={`w-8 h-8 flex items-center justify-center border-2 rounded-md ${koristiDzoker ? 'bg-sky-500 border-sky-500' : 'border-slate-500'}`}>
                  {koristiDzoker && <span className="text-white font-black">✓</span>}
                </div>
              </div>

              <button 
                onClick={posaljiPrognozu} 
                disabled={ucitavanje}
                className={`w-full text-white font-extrabold py-4 rounded-xl shadow-lg transition-transform text-lg ${ucitavanje ? 'bg-slate-600 cursor-not-allowed' : 'bg-sky-600 hover:bg-sky-500 active:scale-95'}`}
              >
                {ucitavanje ? 'ŠALJEM... ⏳' : 'ZAKLJUČAJ 🔒'}
              </button>
            </main>
          )}

          {svePrognoze.length > 0 && (
            <section className="w-full max-w-md bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-700 mb-6">
              <h3 className="text-xl font-bold mb-4 text-center border-b border-slate-700 pb-2 text-sky-400">
                {aktivnaUtakmica?.status === 'zavrsena' ? `Službeni broj: ${aktivnaUtakmica.sluzbeni_broj}` : `Predane prognoze (${svePrognoze.length}/${igraci.length})`}
              </h3>
              <div className="space-y-3">
                {svePrognoze.sort((a,b) => aktivnaUtakmica?.status === 'zavrsena' ? Math.abs(a.broj_gledatelja - aktivnaUtakmica.sluzbeni_broj) - Math.abs(b.broj_gledatelja - aktivnaUtakmica.sluzbeni_broj) : 0).map((p) => (
                  <div key={p.id} className="bg-slate-900 p-4 rounded-xl flex justify-between items-center border border-slate-700">
                    <div className="font-bold text-lg text-slate-300">
                      {p.igraci?.ime} {aktivnaUtakmica?.status === 'zavrsena' && p.joker && <span className="ml-1">🦈</span>}
                    </div>
                    <div className="flex items-center gap-4">
                      {aktivnaUtakmica?.status === 'otvorena' ? (
                        <div className="text-emerald-400 font-bold text-sm tracking-wide flex items-center gap-2">
                           Spremljeno <span className="text-xl">🔒</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-col items-end">
                            <div className={`text-xl font-black ${p.napomena === 'Nije igrao' ? 'text-slate-500 text-sm' : 'text-white'}`}>
                              {p.napomena === 'Nije igrao' ? 'Nije igrao' : p.broj_gledatelja}
                            </div>
                            {p.napomena !== 'Nije igrao' && (
                              <div className="text-xs text-slate-400 font-medium mt-1">
                                Razlika: {p.broj_gledatelja - aktivnaUtakmica.sluzbeni_broj > 0 ? '+' : ''}{p.broj_gledatelja - aktivnaUtakmica.sluzbeni_broj}
                              </div>
                            )}
                          </div>
                          <div className={`font-black text-xl w-8 text-center ${p.bodovi > 0 ? 'text-emerald-400' : p.bodovi < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                            {p.bodovi > 0 ? `+${p.bodovi}` : p.bodovi}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <button 
            onClick={() => setPokaziAdmin(!pokaziAdmin)} 
            className="text-slate-400 text-sm font-bold mt-4 bg-slate-800 hover:bg-slate-700 hover:text-white px-6 py-3 rounded-xl border border-slate-600 transition-all shadow-md"
          >
            📢 SPIKER PANEL
          </button>

          {pokaziAdmin && (
            <div className="w-full max-w-md bg-amber-900/30 p-6 rounded-2xl border border-amber-700/50 mt-4 space-y-6">
              
              {/* OTVARANJE KOLA */}
              <div>
                <h3 className="text-amber-500 font-bold mb-2 uppercase text-sm border-b border-amber-700/50 pb-1">Otvori iduće kolo</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2 mt-2">
                  {utakmiceAdmin.filter(u => u.status === 'zakljucana').map(u => (
                    <div key={u.id} className="flex justify-between items-center bg-slate-900 p-2 rounded-lg border border-slate-700">
                      <span className="text-slate-300 text-sm">{u.naziv}</span>
                      <button onClick={() => otvoriKolo(u.id)} className="bg-sky-600 hover:bg-sky-500 text-white text-xs px-3 py-1 rounded font-bold">Otvori</button>
                    </div>
                  ))}
                  {utakmiceAdmin.filter(u => u.status === 'zakljucana').length === 0 && (
                    <p className="text-xs text-slate-500">Nema zaključanih utakmica.</p>
                  )}
                </div>
              </div>

              {/* ZATVARANJE KOLA */}
              {aktivnaUtakmica?.status === 'otvorena' && (
                <div>
                  <h3 className="text-amber-500 font-bold mb-2 uppercase text-sm border-b border-amber-700/50 pb-1">Zaključi trenutno kolo</h3>
                  <input type="number" className="w-full bg-slate-900 border border-amber-700/50 rounded-lg p-3 text-center text-white mb-2 mt-2" placeholder="Službeni broj..." value={sluzbeniBroj} onChange={(e) => setSluzbeniBroj(e.target.value)} />
                  <button onClick={zavrsiUtakmicu} disabled={ucitavanje} className={`w-full text-white font-bold py-2 rounded-xl ${ucitavanje ? 'bg-slate-600 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-500'}`}>
                    {ucitavanje ? 'DIJELIM BODOVE... ⏳' : 'ZAKLJUČI I PODIJELI 🏆'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* VIEW: POVIJEST KOLA */}
      {aktivniTab === 'povijest' && (
        <div className="w-full flex flex-col items-center">
          <div className="w-full max-w-md bg-slate-800 p-6 rounded-2xl shadow-xl border border-indigo-700/50 mb-6">
            <h2 className="text-2xl font-bold mb-4 text-center text-indigo-400 border-b border-slate-700 pb-4">Povijest Kola</h2>
            
            {zavrseneUtakmice.length === 0 ? (
              <p className="text-center text-slate-400 py-4">Još nema završenih utakmica.</p>
            ) : (
              <select className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500" value={odabranaPovijestId} onChange={(e) => setOdabranaPovijestId(e.target.value)}>
                <option value="">-- Odaberi utakmicu iz arhive --</option>
                {zavrseneUtakmice.map(u => (
                  <option key={u.id} value={u.id}>{u.naziv}</option>
                ))}
              </select>
            )}
          </div>

          {odabranaPovijestId && povijestPrognoze.length > 0 && (
            <section className="w-full max-w-md bg-slate-800 p-6 rounded-2xl shadow-xl border border-slate-700 mb-6">
              {(() => {
                const odabranaObj = zavrseneUtakmice.find(u => u.id.toString() === odabranaPovijestId)
                return (
                  <h3 className="text-xl font-bold mb-4 text-center border-b border-slate-700 pb-2 text-indigo-400">
                    Službeni broj: {odabranaObj?.sluzbeni_broj}
                  </h3>
                )
              })()}
              <div className="space-y-3">
                {povijestPrognoze.map((p) => {
                  const odabranaObj = zavrseneUtakmice.find(u => u.id.toString() === odabranaPovijestId);
                  return (
                    <div key={p.id} className="bg-slate-900 p-4 rounded-xl flex justify-between items-center border border-slate-700">
                      <div className="font-bold text-lg text-slate-300">
                        {p.igraci?.ime} {p.joker && <span className="ml-1">🦈</span>}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end">
                          <div className={`text-xl font-black ${p.napomena === 'Nije igrao' ? 'text-slate-500 text-sm' : 'text-white'}`}>
                            {p.napomena === 'Nije igrao' ? 'Nije igrao' : p.broj_gledatelja}
                          </div>
                          {p.napomena !== 'Nije igrao' && (
                            <div className="text-xs text-slate-400 font-medium mt-1">
                              Razlika: {p.broj_gledatelja - odabranaObj?.sluzbeni_broj > 0 ? '+' : ''}{p.broj_gledatelja - odabranaObj?.sluzbeni_broj}
                            </div>
                          )}
                        </div>
                        <div className={`font-black text-xl w-8 text-center ${p.bodovi > 0 ? 'text-emerald-400' : p.bodovi < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                          {p.bodovi > 0 ? `+${p.bodovi}` : p.bodovi}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* VIEW: TABLICA */}
      {aktivniTab === 'tablica' && (
        <div className="w-full max-w-md bg-slate-800 p-6 rounded-2xl shadow-xl border border-amber-700/50">
          <h2 className="text-2xl font-bold mb-6 text-center text-amber-500 border-b border-slate-700 pb-4">Ukupni Poredak</h2>
          <div className="space-y-4">
            {poredak.map((igrac, index) => (
              <div key={igrac.id} className="bg-slate-900 p-4 rounded-xl flex justify-between items-center border border-slate-700 relative overflow-hidden">
                {index === 0 && <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500"></div>}
                {index === 1 && <div className="absolute left-0 top-0 bottom-0 w-1 bg-slate-300"></div>}
                {index === 2 && <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-700"></div>}
                <div className="flex items-center gap-4">
                  <div className={`font-black text-xl w-6 text-center ${index === 0 ? 'text-amber-500' : index === 1 ? 'text-slate-300' : index === 2 ? 'text-amber-700' : 'text-slate-600'}`}>
                    {index + 1}.
                  </div>
                  <div>
                    <p className="font-bold text-lg text-white">{igrac.ime}</p>
                    <p className="text-xs text-slate-500">Odigrano: {igrac.odigrano} | Preostalo 🦈: {igrac.preostali_dzokeri}</p>
                  </div>
                </div>
                <div className={`text-3xl font-black ${igrac.ukupno < 0 ? 'text-red-500' : 'text-amber-400'}`}>
                  {igrac.ukupno}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VIEW: STATISTIKA */}
      {aktivniTab === 'statistika' && (
        <div className="w-full max-w-md bg-slate-800 p-6 rounded-2xl shadow-xl border border-emerald-700/50">
          <h2 className="text-2xl font-bold mb-6 text-center text-emerald-400 border-b border-slate-700 pb-4">Trofejna Soba</h2>
          
          <div className="space-y-4">
            {statistika.map((igrac) => (
              <div key={igrac.id} className="bg-slate-900 p-4 rounded-xl border border-slate-700">
                <h3 className="font-bold text-xl text-white mb-3 pb-2 border-b border-slate-700/50">{igrac.ime}</h3>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-slate-800 p-2 rounded-lg text-center border border-slate-700">
                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Prosječni promašaj</p>
                    <p className="text-xl font-black text-emerald-400">± {igrac.prosjek}</p>
                  </div>
                  <div className="bg-slate-800 p-2 rounded-lg text-center border border-slate-700">
                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Najbolji ulov</p>
                    <p className="text-xl font-black text-sky-400">± {igrac.najbolji}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className={`text-xs font-bold px-2 py-1 rounded-md border ${igrac.bProrok > 0 ? 'bg-amber-900/30 text-amber-400 border-amber-700' : 'bg-slate-800 text-slate-600 border-slate-700'}`}>
                    👑 Prorok kola: {igrac.bProrok}
                  </span>
                  <span className={`text-xs font-bold px-2 py-1 rounded-md border ${igrac.bSnajper > 0 ? 'bg-sky-900/30 text-sky-400 border-sky-700' : 'bg-slate-800 text-slate-600 border-slate-700'}`}>
                    🎯 Snajper: {igrac.bSnajper}
                  </span>
                  <span className={`text-xs font-bold px-2 py-1 rounded-md border ${igrac.bHrabro > 0 ? 'bg-indigo-900/30 text-indigo-400 border-indigo-700' : 'bg-slate-800 text-slate-600 border-slate-700'}`}>
                    🦈 Hrabro srce: {igrac.bHrabro}
                  </span>
                  <span className={`text-xs font-bold px-2 py-1 rounded-md border ${igrac.bSpavalica > 0 ? 'bg-red-900/30 text-red-400 border-red-700' : 'bg-slate-800 text-slate-600 border-slate-700'}`}>
                    🛌 Spavalica: {igrac.bSpavalica}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default App