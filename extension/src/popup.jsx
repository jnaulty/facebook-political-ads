import { h, render } from 'preact';
import thunkMiddleware from 'redux-thunk';
import { applyMiddleware, compose, combineReducers, createStore } from 'redux';
import { Provider, connect } from 'preact-redux';
import persistState from 'redux-localstorage';
import { createLogger } from 'redux-logger';
import { sendAds, getAds, updateBadge, adForRequest, getBrowserLocale, mergeAds } from 'utils.js';
import langs from 'langs';
import countries from 'i18n-iso-countries';

// grab our languages
['de', 'en', 'fr', 'fi', 'nl', 'da', 'sv'].forEach((lang) => (
  countries.registerLocale(require(`i18n-iso-countries/langs/${lang}.json`))
));

// styles
import "../css/styles.css";

const getMessage = chrome.i18n.getMessage;

// Constants
const ToggleType = {
  ADS: "ads",
  RATER: "rater"
};

const RatingType = {
  POLITICAL: "political",
  NORMAL: "normal"
};

// Action Types
const ACCEPT_TERMS = "accept_terms";
const TOGGLE_TAB = "toggle_tab";
const NEW_ADS = "new_ads";
const NEW_RATINGS = "new_ratings";
const UPDATE_AD = "update_ad";
const UPDATE_RATING = "update_rating";
const SET_LANGUAGE = "set_language";
const SET_COUNTRY = "set_country";
const ACCEPT_LANGUAGE = "accept_locale";

// Actions
const setLanguage = (language) => ({ type: SET_LANGUAGE, language });
const setCountry = (country) => ({ type: SET_COUNTRY, country });
const acceptTerms = () => ({ type: ACCEPT_TERMS });
const acceptLanguage = () => ({ type: ACCEPT_LANGUAGE });
const toggle = (value) => ({ type: TOGGLE_TAB, value });
const newAds = (ads) => ({
  type: NEW_ADS,
  value: ads
});
const newRatings = (ratings) => ({
  type: NEW_RATINGS,
  value: ratings
});
const updateAd = (id, rating) => ({
  type: UPDATE_AD,
  id: id,
  value: rating
});
const updateRating = (id, rating) => ({
  type: UPDATE_RATING,
  id: id,
  value: rating
});
const rateAd = (ad, rating, update) => {
  return (dispatch) => {
    let body = {
      ...adForRequest(ad),
      political: rating === RatingType.POLITICAL,
    };
    dispatch(update(ad.id, rating));
    let cb = () => ({});
    return sendAds([body], store.getState().language).then(cb, cb);
  };
};

// Reducers
const active = (state = ToggleType.RATER, action) => {
  switch(action.type) {
  case TOGGLE_TAB:
    return action.value;
  default:
    return state;
  }
};

const buildUpdate = (type) => ((state = [], action) => {
  switch(action.type) {
  case "new_" + type + "s":
    return mergeAds(state, action.value);
  case "update_" + type:
    return mergeAds(state.map(ad => {
      if(ad.id === action.id) {
        return { ...ad, rating: action.value };
      }
      return ad;
    }), []);
  default:
    return state;
  }
});

const terms = (state = false, action) => {
  switch(action.type) {
  case ACCEPT_TERMS:
    return true;
  default:
    return state;
  }
};


const browserLocale = getBrowserLocale();
const language = (state = browserLocale, action) => {
  switch(action.type) {
  case SET_LANGUAGE:
    return { ...state, language: action.language };
  case SET_COUNTRY:
    return { ...state, country: action.country };
  case ACCEPT_LANGUAGE:
    return { ...state, accepted: true };
  default:
    return state;
  }
};

// The main reducer!
const reducer = combineReducers({
  active,
  ads: buildUpdate("ad"),
  ratings: buildUpdate("rating"),
  terms,
  language
});

let middleware = [thunkMiddleware];
if(process.env.NODE_ENV === 'development') {
  middleware.push(createLogger());
}
const enhancer = compose(...[persistState(), applyMiddleware(...middleware)]);
let store = createStore(reducer, enhancer);

// Ad utilities
const getUnratedRatings = (ratings) => (
  ratings.filter(rating => rating.rating === RatingType.POLITICAL || !("rating" in rating))
);

const countUnratedRatings = (ratings) => (
  ratings.filter(rating => !("rating" in rating)).length
);

let div = document.createElement('div');
const query = (html, selector) => {
  div.innerHTML = html;
  return div.querySelector(selector);
};

const getImage = (html) => {
  let img = query(html, 'img');
  if(img)
    return img.getAttribute('src');
};

const getAdMessage = (html) => {
  let p = query(html, '.userContent p') || query("div.mbs") || query(html, 'span');
  if(p)
    return p.innerHTML;
};

const getTitle = (html) => {
  let a = query(html, 'h5 a') || query(html, 'h6 a') || query(html, 'strong') ||
      query(html, 'span.fsl');
  if(a)
    return a.innerText;
};

const insertAdFields = (ads) => (
  ads.map((ad) => ({
    ...ad,
    image: getImage(ad.html),
    message: getAdMessage(ad.html),
    title: getTitle(ad.html)
  }))
);

// Views
const Ad = ({title, message, id, image}) => (
  <div className="ad" id={id}>
    <div className="chiclet">
      {image ? <img src={image} /> : ''}
    </div>
    <div className="ad-display">
      <div className="advertiser">{title}</div>
      <div className="ad-content" dangerouslySetInnerHTML={{__html:message}} />
    </div>
  </div>
);

const RatingForm = ({rating, action, question})=> (
  <div className="rater">
    {getMessage(question)}
    <button
      id={'political' + rating.id}
      onClick={function(){ return action(rating, RatingType.POLITICAL); }}
    >
      {getMessage('political')}
    </button>
    <button
      id={'normal' + rating.id}
      onClick={function(){ return action(rating, RatingType.NORMAL); }}
    >
      {getMessage('normal')}
    </button>
  </div>
);

// Ads to be rated and sent to the server
const Rating = ({rating, action, question}) => (
  <div className="rating">
    <Ad
      title={rating.title}
      message={rating.message}
      id={rating.id}
      image={rating.image}
    />
    {("rating" in rating) ?
      <b className="political">{getMessage('political')}</b> :
      <RatingForm action={action} rating={rating} question={question} /> }
  </div>
);

const Ratings = ({onRatingClick, ratings}) => (
  <div id="ratings">
    {ratings.map(rating =>
      (<Rating key={rating.id} rating={rating} action={onRatingClick} question="rating_question" />)
    )}
  </div>
);
const ratingsStateToProps = (state) => ({
  ratings: insertAdFields(getUnratedRatings(state.ratings))
});
const ratingsDispatchToProps = (dispatch) => ({
  onRatingClick: (id, rating) => {
    dispatch(rateAd(id, rating, updateRating));
  }
});
const UnratedRatings = connect(
  ratingsStateToProps,
  ratingsDispatchToProps
)(Ratings);

// Ads from the server to show
let Ads = ({ads, onAdClick}) => (
  <div id="ads">
    {ads.map(ad =>
      (<Rating key={ad.id} rating={ad} action={onAdClick} question="verify_question" />)
    )}
  </div>
);
const adStateToProps = (state) => ({
  ads: insertAdFields(getUnratedRatings(state.ads))
});
const adDispatchToProps = (dispatch) => ({
  onAdClick: (id, rating) => {
    dispatch(rateAd(id, rating, updateAd));
  }
});
Ads = connect(
  adStateToProps,
  adDispatchToProps
)(Ads);

// Controls which section of tabs to show, defaults to the
const Toggle = ({type, message, active, amount, onToggleClick}) => (
  <div
    className={'toggle' + (active === type ? ' active' : '')}
    onClick={function() { onToggleClick(type); }}
  >
    {getMessage(message)}{(amount ? <b>{100 > amount ? amount : '100+'}</b> : '')}
  </div>
);

// Our Main container.
let Toggler = ({ads, ratings, active, onToggleClick}) => (
  <div id="toggler">
    <div id="tabs">
      <Toggle
        amount={countUnratedRatings(ratings)}
        active={active}
        message="rate_ads" onToggleClick={onToggleClick}
        type={ToggleType.RATER}
      />
      <Toggle
        amount={countUnratedRatings(ads)}
        active={active}
        message="see_ads" onToggleClick={onToggleClick}
        type={ToggleType.ADS}
      />
    </div>
    <div id="container">
      {active === ToggleType.ADS ?
        <Ads ads={ads} /> :
        <UnratedRatings ratings={ratings} />}
    </div>
  </div>
);
const togglerDispatchToProps = (dispatch) => ({
  onToggleClick: (type) => {
    dispatch(toggle(type));
  }
});
Toggler = connect(
  (state) => (state),
  togglerDispatchToProps
)(Toggler);

let SelectLanguage = ({ language, onChange }) => (
  <select value={language} onChange={onChange}>
    {langs.all().map((lang) => (
      <option id="language" key={lang["1"]} value={lang["1"]}>
        {lang["name"]} / {lang["local"]}
      </option>
    ))}
  </select>
);
const selectLanguageDispatchToProps = (dispatch) => ({
  onChange: (e) => {
    dispatch(setLanguage(e.target.value));
  }
});
SelectLanguage = connect(
  (state) => state.language,
  selectLanguageDispatchToProps
)(SelectLanguage);

let SelectCountry = ({ language, country, onChange }) => {
  let lang = language;
  let keys = Object.keys(countries.getNames(language));
  if(keys.length === 0) {
    keys = Object.keys(countries.getNames('en'));
    lang = 'en';
  }
  return (<select id="country" value={country} onChange={onChange}>
    {keys.map((country) => (
      <option key={country} value={country}>
        {countries.getName(country, lang)}
      </option>
    ))}
  </select>);
};
const selectCountryDispatchToProps = (dispatch) => ({
  onChange: (e) => {
    dispatch(setCountry(e.target.value));
  }
});
SelectCountry = connect(
  (state) => state.language,
  selectCountryDispatchToProps
)(SelectCountry);

let Language = ({ onAcceptLang }) => (
  <form id="language" onSubmit={onAcceptLang}>
    <div>
      <h2>{getMessage("language_settings")}</h2>
      <p dangerouslySetInnerHTML={{__html:getMessage("you_speak",
        [langs.where('1', browserLocale.language).local || 'Unknown Language',
          countries.getName(browserLocale.country, browserLocale.language) ||
          countries.getName(browserLocale.country, 'en') || 'Unknown Country'])}} />
      <p>
        <label htmlFor="language">Language: </label><SelectLanguage /><br />
        <label htmlFor="country">Country: </label><SelectCountry />
      </p>
      <p>{getMessage("language_instructions")}</p>
    </div>
    <div>
      <input className="button" type="submit" value="OK" />
    </div>
  </form>
);
const languageDispatchToProps = (dispatch) => ({
  onAcceptLang: (e) => {
    e.preventDefault();
    dispatch(acceptLanguage());
  }
});
Language = connect(
  (state) => state.language,
  languageDispatchToProps
)(Language);

const Onboarding = ({onAcceptClick}) => (
  <div id="tos">
    <div id="terms" dangerouslySetInnerHTML={{__html:getMessage("terms_of_service")}} />
    <div id="accept-box">
      <button id="accept" onClick={onAcceptClick}>
        Accept
      </button>
    </div>
  </div>
);

let Dispatcher = ({terms, language, onAcceptClick}) => {
  if(terms) {
    if(language.accepted) {
      return <Toggler />;
    } else {
      return <Language />;
    }
  } else {
    return <Onboarding onAcceptClick={onAcceptClick}/>;
  }
};

const dispatchToProps = (dispatch) => ({
  onAcceptClick: (e) => {
    e.preventDefault();
    dispatch(acceptTerms());
  }
});

Dispatcher = connect(
  (state) => state,
  dispatchToProps
)(Dispatcher);

render(
  <Provider store={store}>
    <div id="popup">
      <Dispatcher />
    </div>
  </Provider>,
  document.body
);

// connect to the ratings channel
chrome.runtime.onMessage.addListener((ads) => store.dispatch(newRatings(ads)));
store.subscribe(() => updateBadge(store.getState().ratings || []));

// Refresh our ads by first filtering out ones the user has seen, and then merging like with
// ratings.
getAds(store.getState().language, (resp) => {
  const set = new Set();
  getUnratedRatings(store.getState().ratings).map((rating) => set.add(rating.id));
  store.dispatch(newAds(resp.filter((ad) => !set.has(ad.id))));
});
