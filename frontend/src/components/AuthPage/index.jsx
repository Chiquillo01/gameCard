import { useState } from 'react';
import styles from './authpage.module.css';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';

const LoginIcon = ({ color }) => (
  <svg viewBox='0 0 16 16' shapeRendering='crispEdges'>
    <rect x='5' y='1' width='6' height='1' fill={color} />
    <rect x='4' y='2' width='1' height='1' fill={color} />
    <rect x='11' y='2' width='1' height='1' fill={color} />
    <rect x='3' y='3' width='1' height='4' fill={color} />
    <rect x='12' y='3' width='1' height='4' fill={color} />
    <rect x='4' y='7' width='1' height='1' fill={color} />
    <rect x='11' y='7' width='1' height='1' fill={color} />
    <rect x='5' y='8' width='6' height='2' fill={color} />
    <rect x='6' y='10' width='4' height='5' fill={color} />
    <rect x='7' y='11' width='2' height='2' fill='#241305' />
  </svg>
);

const RegisterIcon = ({ color }) => (
  <svg viewBox='0 0 16 16' shapeRendering='crispEdges'>
    <rect x='3' y='1' width='9' height='13' fill={color} />
    <rect x='2' y='2' width='1' height='11' fill={color} />
    <rect x='12' y='2' width='1' height='11' fill={color} />
    <rect x='4' y='4' width='6' height='1' fill='#241305' />
    <rect x='4' y='6' width='6' height='1' fill='#241305' />
    <rect x='4' y='8' width='4' height='1' fill='#241305' />
    <rect x='9' y='9' width='4' height='1' fill={color} />
    <rect x='9' y='11' width='4' height='1' fill={color} />
    <rect x='10' y='8' width='1' height='4' fill={color} />
  </svg>
);

const LOGIN_CAPTION = 'El guardián reconoce a los suyos...';
const REGISTER_CAPTION = 'Escribe tu nombre en el gran registro...';

const AuthPage = () => {
  const [showLogin, setShowLogin] = useState(true);
  const [isDay, setIsDay] = useState(false);
  const [hoverPreview, setHoverPreview] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const formTitle = showLogin ? 'INICIAR SESIÓN' : 'CREAR CUENTA';
  const activeColor = '#241305';
  const inactiveColor = '#e8d3a0';

  const handleHover = (mode) => (e) => {
    setHoverPreview(mode);
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className={styles.page}>
      <div className={styles.sceneFrame}>
        <div className={styles.sceneInner}>
          <div className={styles.skyNight} />
          <div className={styles.skyDay} style={{ opacity: isDay ? 1 : 0 }} />

          <div className={styles.celestialWrap} onClick={() => setIsDay((d) => !d)}>
            <div className={styles.moon} style={{ opacity: isDay ? 0 : 1 }}>
              <div className={styles.moonCraters} />
            </div>
            <div className={styles.sun} style={{ opacity: isDay ? 1 : 0 }} />
          </div>

          <div className={styles.starsLayer} style={{ opacity: isDay ? 0 : 1 }} />

          <div className={styles.farMountains} />
          <div className={styles.mountains} />

          <div className={`${styles.tower} ${styles.towerLeft}`}>
            <div className={styles.towerBrick} />
            <div className={styles.towerHighlightEdge} />
            <div className={styles.towerRoofCap} />
            <div className={styles.towerRoofGem} />
            <div className={styles.towerCrenellation} />
            <div className={styles.towerLedge} style={{ top: '3.75em' }} />
            <div className={styles.towerLight} style={{ top: '5.625em' }} />
            <div className={styles.towerLight} style={{ top: '11.25em' }} />
            <div className={`${styles.towerLight} ${styles.towerLightWarm}`} style={{ top: '16.875em' }} />
            <div className={styles.towerIvy} />
          </div>

          <div className={`${styles.tower} ${styles.towerRight}`}>
            <div className={styles.towerBrick} />
            <div className={styles.towerHighlightEdge} />
            <div className={styles.towerRoofCap} />
            <div className={styles.towerRoofGem} />
            <div className={styles.towerCrenellation} />
            <div className={styles.towerLedge} style={{ top: '3.125em' }} />
            <div className={styles.towerLight} style={{ top: '5em' }} />
            <div className={`${styles.towerLight} ${styles.towerLightWarm}`} style={{ top: '10.625em' }} />
            <div className={styles.towerLight} style={{ top: '16.25em' }} />
            <div className={styles.towerIvy} />
          </div>

          <div className={styles.curtainWall}>
            <div className={styles.curtainWallTexture} />
            <div className={styles.curtainWallHighlight} />
          </div>

          <div className={styles.ground}>
            <div className={styles.groundLight} />
          </div>

          <div className={styles.stonePath}>
            <div className={styles.stonePathLight} />
            <div className={styles.stonePathShade} />
            <div className={styles.stonePathMoss} />
          </div>

          <div className={styles.portal}>
            <div className={styles.titlePlaque}>
              <div className={`${styles.plaqueRivet} ${styles.plaqueRivetTL}`} />
              <div className={`${styles.plaqueRivet} ${styles.plaqueRivetTR}`} />
              <div className={`${styles.plaqueRivet} ${styles.plaqueRivetBL}`} />
              <div className={`${styles.plaqueRivet} ${styles.plaqueRivetBR}`} />
              <div className={styles.titleText}>PixelQuest</div>
            </div>

            <div className={styles.archFrame}>
              <div className={styles.archStone}>
                <div className={styles.archSeams} />
                <div className={styles.archMoss} />
                <div className={styles.archHighlight} />
              </div>

              <div className={styles.archVoid}>
                <div className={styles.glowRingOuter} />
                <div className={styles.glowRingInner} />
                <div className={styles.glowRingDiamond} />
                <div className={styles.glowRingDiamondOuter} />

                <div className={styles.toggleGroup}>
                  <div
                    role='button'
                    tabIndex={0}
                    aria-pressed={showLogin}
                    onClick={() => setShowLogin(true)}
                    onKeyDown={(e) => e.key === 'Enter' && setShowLogin(true)}
                    onMouseMove={handleHover('login')}
                    onMouseLeave={() => setHoverPreview(null)}
                    className={`${styles.toggleButton} ${showLogin ? styles.toggleButtonActive : ''}`}
                  >
                    <LoginIcon color={showLogin ? activeColor : inactiveColor} />
                  </div>

                  <div
                    role='button'
                    tabIndex={0}
                    aria-pressed={!showLogin}
                    onClick={() => setShowLogin(false)}
                    onKeyDown={(e) => e.key === 'Enter' && setShowLogin(false)}
                    onMouseMove={handleHover('register')}
                    onMouseLeave={() => setHoverPreview(null)}
                    className={`${styles.toggleButton} ${!showLogin ? styles.toggleButtonActive : ''}`}
                  >
                    <RegisterIcon color={!showLogin ? activeColor : inactiveColor} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelInset} />
        <div className={`${styles.panelOrnament} ${styles.panelOrnamentTL}`} />
        <div className={`${styles.panelOrnament} ${styles.panelOrnamentTR}`} />
        <div className={`${styles.panelOrnament} ${styles.panelOrnamentBL}`} />
        <div className={`${styles.panelOrnament} ${styles.panelOrnamentBR}`} />

        <div className={styles.panelTitle}>{formTitle}</div>
        <div className={styles.panelUnderline} />

        {showLogin ? (
          <LoginForm onSwitchMode={() => setShowLogin(false)} />
        ) : (
          <RegisterForm onSwitchMode={() => setShowLogin(true)} />
        )}
      </div>

      {hoverPreview && (
        <div
          className={styles.tooltip}
          style={{ left: mousePos.x + 18, top: mousePos.y + 18, opacity: hoverPreview ? 1 : 0 }}
        >
          {hoverPreview === 'login' ? LOGIN_CAPTION : REGISTER_CAPTION}
        </div>
      )}
    </div>
  );
};

export default AuthPage;
