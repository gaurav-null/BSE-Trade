import logo from '../assets/logo.svg';

const CONNECTION_LABEL = { connecting: 'Connecting…', live: 'Live', reconnecting: 'Reconnecting…' };

export default function Header({ connection }) {
  return (
    <header className="topbar">
      <div className="brand">
        <img src={logo} alt="" width="36" height="36" />
        <div>
          <h1>BSE Trades</h1>
          <p className="muted">Live dashboard — updates the moment a pull finishes</p>
        </div>
      </div>
      <span className={`pill pill-${connection}`}>
        <i /> {CONNECTION_LABEL[connection]}
      </span>
    </header>
  );
}
