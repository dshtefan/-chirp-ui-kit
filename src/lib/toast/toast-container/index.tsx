import * as S from './style';

export const ToastContainer = () => (
    <S.Container
        autoClose={5000}
        closeButton={false}
        closeOnClick={false}
        icon={false}
        hideProgressBar
        limit={5}
        position="bottom-right"
    />
);
