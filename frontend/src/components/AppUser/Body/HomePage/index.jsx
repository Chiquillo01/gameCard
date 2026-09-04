import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from 'react-query';
import styles from './homePage.module.css';
import { removeSession } from '../../../../lib/utils/userSession';

const BagIcon = () => (
  <svg viewBox='0 0 16 16' shapeRendering='crispEdges'>
    <rect x='5' y='2' width='6' height='2' fill='#3a2510' />
    <rect x='4' y='4' width='8' height='1' fill='#e8d3a0' />
    <rect x='3' y='5' width='10' height='8' fill='#c0392b' />
    <rect x='3' y='13' width='10' height='1' fill='#7a2015' />
    <rect x='6' y='7' width='4' height='3' fill='#ffd76a' />
  </svg>
);

const PlayerIcon = () => (
  <svg viewBox='0 0 16 16' shapeRendering='crispEdges'>
    <rect x='6' y='2' width='4' height='4' fill='#241305' />
    <rect x='4' y='9' width='8' height='5' fill='#241305' />
    <rect x='3' y='13' width='10' height='2' fill='#241305' />
  </svg>
);

const ZONES = {
  bar: { title: 'LA BARRA', buttons: [{ label: 'TIENDA', to: '/store' }, { label: 'MERCADO', to: '/market' }] },
  table: { title: 'LA MESA', buttons: [{ label: 'DUELO', to: '/duel' }] },
  bag: { title: 'TU EQUIPAJE', buttons: [{ label: 'MAZOS', to: '/deck' }, { label: 'COLECCIÓN', to: '/collection' }] },
};

const HomePage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [focus, setFocus] = useState(null);
  const [isDay, setIsDay] = useState(false);
  const [playerMenuOpen, setPlayerMenuOpen] = useState(false);
  const playerWrapRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (playerWrapRef.current && !playerWrapRef.current.contains(event.target)) {
        setPlayerMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    removeSession();
    queryClient.clear();
    navigate('/auth');
  };

  const worldClass = focus ? `${styles.world} ${styles[`focus${focus.charAt(0).toUpperCase()}${focus.slice(1)}`]}` : styles.world;
  const zone = focus ? ZONES[focus] : null;

  return (
    <div className={styles.page}>
      <div className={styles.scene}>
        <div className={worldClass}>
          <div className={styles.wall} />
          <div className={styles.wallKnot} style={{ left: '25em', top: '11.25em', width: '0.625em', height: '0.875em' }} />
          <div className={styles.wallKnot} style={{ left: '61.25em', top: '7.5em', width: '0.5em', height: '0.75em' }} />
          <div className={styles.wallKnot} style={{ left: '47.5em', top: '16.25em', width: '0.5625em', height: '0.8125em' }} />

          <div className={styles.shieldWrap}>
            <div className={styles.sword} style={{ left: '1em', transform: 'rotate(28deg)' }} />
            <div className={styles.sword} style={{ left: '4.625em', transform: 'rotate(-28deg)' }} />
            <div className={styles.shield} />
            <div className={styles.shieldEmblem} />
          </div>

          <div className={styles.floor} />
          <div className={styles.rug} />
          <div className={styles.rugInner} />

          <div className={styles.ceilingTop} />
          <div className={styles.ceilingCrossBeam} />
          <div className={styles.beamLeft} />
          <div className={styles.beamRight} />

          <div className={styles.lanternRope} />
          <div className={styles.lanternBox}>
            <div className={styles.lanternFlame} />
          </div>

          <div className={`${styles.torchBracket} ${styles.torchLeft}`} />
          <div className={`${styles.torchFlame} ${styles.torchLeftFlame}`} />
          <div className={`${styles.torchBracket} ${styles.torchRight}`} />
          <div className={`${styles.torchFlame} ${styles.torchRightFlame}`} />

          {/* window: day/night toggle, purely decorative */}
          <div className={styles.window} onClick={() => setIsDay((d) => !d)}>
            <div className={styles.windowInner}>
              <div className={`${styles.windowSky} ${styles.windowNightSky}`} style={{ opacity: isDay ? 0 : 1 }} />
              <div className={`${styles.windowSky} ${styles.windowDaySky}`} style={{ opacity: isDay ? 1 : 0 }} />
              <div className={styles.windowMoon} style={{ opacity: isDay ? 0 : 1 }} />
              <div className={styles.windowSun} style={{ opacity: isDay ? 1 : 0 }} />
              <div className={styles.windowStars} style={{ opacity: isDay ? 0 : 1 }} />
              <div className={styles.windowBarV} />
              <div className={styles.windowBarH} />
            </div>
          </div>
          <div className={styles.windowSill} />
          <div className={styles.plantPot} />
          <div className={styles.plantLeaf1} />
          <div className={styles.plantLeaf2} />

          {/* bag hotspot -> decks / collection */}
          <div className={styles.bagHotspot} onClick={() => setFocus('bag')} role='button' tabIndex={0}>
            <BagIcon />
          </div>
          <div className={`${styles.hotspotLabel} ${styles.bagLabel}`}>Mazos y Colección</div>

          {/* table hotspot -> duel */}
          <div className={styles.tableHotspot} onClick={() => setFocus('table')} role='button' tabIndex={0}>
            <div className={`${styles.chair} ${styles.chairLeft}`} />
            <div className={`${styles.chair} ${styles.chairRight}`} />
            <div className={styles.tableTop}>
              <div className={styles.tableGrain} />
              <div className={`${styles.mug} ${styles.mugLeft}`} />
              <div className={`${styles.mug} ${styles.mugRight}`} />
              <div className={styles.candleStick} />
              <div className={styles.candleFlame} />
            </div>
          </div>
          <div className={`${styles.hotspotLabel} ${styles.tableLabel}`}>La Mesa — Duelos</div>

          {/* bar hotspot -> store / market */}
          <div className={styles.barHotspot} onClick={() => setFocus('bar')} role='button' tabIndex={0}>
            <div className={`${styles.shelf} ${styles.shelfTop}`} />
            <div className={styles.bottle} style={{ left: '1.875em', top: '-2.5em', width: '1em', height: '2.5em', background: 'linear-gradient(160deg,#4a9a68,#2c5a3a)', boxShadow: '0 0 8px rgba(120,220,150,0.4)' }} />
            <div className={styles.bottle} style={{ left: '3.75em', top: '-2.125em', width: '0.875em', height: '2.125em', background: 'linear-gradient(160deg,#c85a42,#7a2818)', boxShadow: '0 0 8px rgba(255,120,90,0.4)' }} />
            <div className={styles.bottle} style={{ left: '5.5em', top: '-2.75em', width: '1em', height: '2.75em', background: 'linear-gradient(160deg,#ffe390,#c78a2a)', boxShadow: '0 0 8px rgba(255,215,106,0.4)' }} />
            <div className={styles.bottle} style={{ left: '7.5em', top: '-1.875em', width: '0.875em', height: '1.875em', background: 'linear-gradient(160deg,#8fb3e0,#4a6a94)' }} />
            <div className={styles.bottle} style={{ left: '9.375em', top: '-2.375em', width: '1em', height: '2.375em', background: 'linear-gradient(160deg,#4a9a68,#2c5a3a)' }} />
            <div className={`${styles.shelf} ${styles.shelfMid}`} />
            <div className={styles.bottle} style={{ left: '5.625em', top: '1.375em', width: '1em', height: '2.375em', background: 'linear-gradient(160deg,#c85a42,#7a2818)' }} />
            <div className={styles.bottle} style={{ left: '13.75em', top: '1.25em', width: '0.875em', height: '2.5em', background: 'linear-gradient(160deg,#ffe390,#c78a2a)' }} />
            <div className={styles.bottle} style={{ left: '18.75em', top: '1.5em', width: '1em', height: '2.25em', background: 'linear-gradient(160deg,#8fb3e0,#4a6a94)' }} />

            <div className={styles.mugRack} />
            <div className={`${styles.mugHang} ${styles.mugHang1}`} />
            <div className={`${styles.mugHang} ${styles.mugHang2}`} />

            <div className={styles.bartender}>
              <div className={styles.btHead} />
              <div className={styles.btHair} />
              <div className={styles.btTorso} />
              <div className={styles.btApron} />
              <div className={`${styles.btArm} ${styles.btArmLeft}`} />
              <div className={`${styles.btArm} ${styles.btArmRight}`} />
              <div className={`${styles.btLeg} ${styles.btLegLeft}`} />
              <div className={`${styles.btLeg} ${styles.btLegRight}`} />
            </div>

            <div className={styles.keg}>
              <div className={`${styles.kegBand} ${styles.kegBandTop}`} />
              <div className={`${styles.kegBand} ${styles.kegBandBottom}`} />
            </div>

            <div className={styles.counter}>
              <div className={styles.counterInset} />
              <div className={styles.counterLine1} />
              <div className={styles.counterLine2} />
            </div>
          </div>
          <div className={`${styles.hotspotLabel} ${styles.barLabel}`}>La Barra — Tienda y Mercado</div>
        </div>
      </div>

      <div className={styles.playerWrap} ref={playerWrapRef}>
        <div className={styles.playerIcon} onClick={() => setPlayerMenuOpen((o) => !o)} role='button' tabIndex={0}>
          <PlayerIcon />
        </div>

        {playerMenuOpen && (
          <div className={styles.playerMenu}>
            <div className={styles.playerMenuTitle}>MENÚ</div>
            <button className={styles.playerMenuItem} onClick={() => navigate('/profile')}>
              Perfil
            </button>
            <button className={styles.playerMenuItem} onClick={() => navigate('/purchase-history')}>
              Historial de compras
            </button>
            <button className={styles.playerMenuItem} onClick={() => navigate('/friends')}>
              Amigos
            </button>
            <button className={styles.playerMenuItem} onClick={handleLogout}>
              Cerrar sesión
            </button>
          </div>
        )}
      </div>

      <div className={styles.roomTitle} style={{ opacity: focus ? 0 : 1 }}>
        PixelQuest
      </div>

      {zone && (
        <div className={styles.contextPanel}>
          <div className={styles.contextTitle}>{zone.title}</div>
          <div className={styles.contextButtons}>
            {zone.buttons.map((btn) => (
              <div key={btn.to} className={styles.contextButton} onClick={() => navigate(btn.to)} role='button' tabIndex={0}>
                {btn.label}
              </div>
            ))}
          </div>
          <button className={styles.backLink} onClick={() => setFocus(null)}>
            ← Volver a la sala
          </button>
        </div>
      )}
    </div>
  );
};

export default HomePage;
