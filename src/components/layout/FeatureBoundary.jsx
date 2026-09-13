import { Component } from 'react';

// A device/API rendering failure must not remove the surrounding navigation.
export default class FeatureBoundary extends Component {
  state = { failed: false, revision: 0 };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <section className="panel p-6" role="alert">
      <h2 className="font-display text-xl">This view couldn’t open.</h2>
      <p className="my-3">Your session is still available. Retry this view or use the navigation above.</p>
      <button className="button" onClick={() => this.setState(state => ({ failed: false, revision: state.revision + 1 }))}>Retry this view</button>
    </section>;
    return <div key={this.state.revision}>{this.props.children}</div>;
  }
}
