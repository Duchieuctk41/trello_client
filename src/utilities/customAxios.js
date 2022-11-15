import axios from 'axios'
import { toast } from 'react-toastify'
import { signOutUserAPI } from 'redux/user/userSlice'
import { refreshTokenAPI } from 'actions/ApiCall'

// How can I use the Redux store in non-component files?
// https://redux.js.org/faq/code-structure#how-can-i-use-the-redux-store-in-non-component-files
// Inject store
let store
export const injectStore = _store => {
  store = _store
}

let authorizedAxiosInstance = axios.create()
authorizedAxiosInstance.defaults.timeout = 1000 * 60 * 10 // 10 minutes
authorizedAxiosInstance.defaults.withCredentials = true // Make Axios send cookies in its requests automatically.

// Kỹ thuật dùng javascript kết hợp css pointer-event để chặn user click nhanh tại bất kỳ chỗ nào có hành động click gọi api
// Đây là một kỹ thuật rất hay mà không phải dev nào cũng biết.
const updateSendingStatus = (sending = true) => {
  const submits = document.querySelectorAll('.tqd-send')
  for (let i = 0; i < submits.length; i++) {
    if (sending) submits[i].classList.add('tqd-waiting')
    else submits[i].classList.remove('tqd-waiting')
  }
}

// Interceptor Request
authorizedAxiosInstance.interceptors.request.use((config) => {
  // Chỉ ok nếu status code nằm trong khoảng 200 > 209 (default của axios nếu bạn không làm gì),
  // Nhưng ở đây chúng ta cần viết lại validateStatus để chấp nhận mã 302 (mã cho phép chuyển hướng - redirect)
  config.validateStatus = (status) => {
    return (status >= 200 && status < 300) || status === 302
  }
  updateSendingStatus(true)

  return config
}, (error) => {
  return Promise.reject(error)
})

// Khởi tạo một cái promise cho việc gọi api refresh_token
// Mục đích tạo Promise này để khi nào gọi api refresh_token xong xuôi thì mới retry lại các api bị lỗi trước đó.
let refreshTokenPromise = null

// Interceptor Response
authorizedAxiosInstance.interceptors.response.use((response) => {
  // Chuyển hướng URL từ phía BE nếu cần
  if (response?.status === 302) {
    location.replace(response?.headers?.Location)
  }
  updateSendingStatus(false)

  return response
}, (error) => {
  updateSendingStatus(false)

  // Nếu nhận mã 401 từ BE trả về => gọi api signOut luôn
  if (error?.response?.status === 401) {
    store.dispatch(signOutUserAPI(false))
  }

  // Nếu nhận mã 410 từ BE trả về => Xử lý refresh Token
  const originalRequest = error.config
  if (error?.response?.status === 410 && !originalRequest._retry) {
    originalRequest._retry = true

    // Kiểm tra xem nếu chưa có refreshTokenPromise thì thực hiện gán việc gọi api refresh_token vào cho cái refreshTokenPromise này
    if (!refreshTokenPromise) {
      refreshTokenPromise = refreshTokenAPI()
        .then((data) => { return data?.accessToken }) // đồng thời accessToken đã nằm trong httpOnly cookie (xử lý từ phía BE)
        .catch(() => { store.dispatch(signOutUserAPI(false)) }) // Nếu nhận bất kỳ lỗi nào từ api refresh token thì cứ logout luôn
        .finally(() => { refreshTokenPromise = null }) // Xong xuôi hết thì gán lại cái refreshTokenPromise về null
    }

    // eslint-disable-next-line no-unused-vars
    return refreshTokenPromise.then(accessToken => {
      // Hiện tại ở đây không cần dùng gì tới accessToken vì chúng ta đã đưa nó vào cookie (xử lý từ phía BE) khi api được gọi thành công.
      // Trường hợp nếu dự án cần lưu accessToken vào localstorage hoặc đâu đó thì sẽ viết code ở đây.

      // Quan trọng: Return lại axios instance của chúng ta kết hợp các originalRequest để call lại những api ban đầu bị lỗi
      return authorizedAxiosInstance(originalRequest)
    })
  }

  // Show message lỗi trả về từ Back-end API khi gọi bất kỳ một api nào
  let errorMessage = error?.message
  if (error?.response?.data?.errors) {
    errorMessage = error?.response?.data?.errors
  }

  if (error?.response?.status !== 410) {
    toast.error(errorMessage)
  }

  return Promise.reject(error)
})

export default authorizedAxiosInstance

