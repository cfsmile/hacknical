
import ShareAnalyse from '../../models/share-analyse';
import logger from '../../utils/logger';
import User from '../../models/users';
import ResumePub from '../../models/resume-pub';
import SlackMsg from '../../services/slack';
import { getValue } from '../../utils/helper';

const getPubResumeInfo = async (hash) => {
  const findResume = await ResumePub.getPubResumeInfo(hash);

  if (findResume.success) {
    const { name, userId, resumeHash } = findResume.result;
    const user = await User.findOne({ userId });
    return {
      name,
      resumeHash,
      login: user.githubInfo.login
    };
  }
};

const updateViewData = async (ctx, options) => {
  const { from } = ctx.query;
  const { platform, browser } = ctx.state;
  const {
    url = '',
    type = null,
    login = null,
  } = options;
  const updateResult = await ShareAnalyse.updateShare({ login, url });
  if (!updateResult.success) {
    ctx.redirect('/404');
    return;
  }
  await ShareAnalyse.updateViewData({
    platform,
    url: options.url,
    browser: browser || '',
    from: from || ''
  });
  if (type) {
    ctx.cache.hincrby(type, 'pageview', 1);
    new SlackMsg(ctx.mq).send({
      type: 'view',
      data: `【${type.toUpperCase()}:/${url}】`
    });
  }
  logger.info(`[${type.toUpperCase()}:VIEW][${url}]`);
};

const collectGithubRecord = (key = 'params.login') => async (ctx, next) => {
  const login = getValue(ctx, key);
  const { githubLogin } = ctx.session;
  const { path } = ctx.request;

  // make sure that admin user's visit will not be collected.
  if (githubLogin !== login) {
    const url = path.slice(1);
    updateViewData(ctx, { login, url, type: 'github' });
  }
  await next();
};

const collectResumeRecordByHash = (key = 'params.hash') => async (ctx, next) => {
  const { notrace } = ctx.query;
  const hash = getValue(ctx, key);
  const { path } = ctx.request;

  const { githubLogin } = ctx.session;
  const user = await getPubResumeInfo(hash);
  const isAdmin = user && user.login === githubLogin;

  if ((!isAdmin && !notrace) || notrace === 'false') {
    const url = path.slice(1);
    updateViewData(ctx, { url, type: 'resume' });
  }

  ctx.query.isAdmin = isAdmin;
  ctx.query.userName = user ? user.name : '';
  ctx.query.userLogin = user ? user.login : '';
  await next();
};

export default {
  github: collectGithubRecord,
  resume: collectResumeRecordByHash,
};
