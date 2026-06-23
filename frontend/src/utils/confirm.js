import Swal from 'sweetalert2';

export const confirmAction = async ({
  title = 'Are you sure?',
  text = '',
  confirmButtonText = 'Yes, proceed',
  cancelButtonText = 'Cancel',
  icon = 'warning',
  preConfirm = null
}) => {
  if (document.activeElement) {
    document.activeElement.blur();
  }
  const result = await Swal.fire({
    title,
    text,
    icon,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    showLoaderOnConfirm: !!preConfirm,
    preConfirm: preConfirm ? async () => {
      try {
        await preConfirm();
      } catch (error) {
        const backendMsg = error.response?.data?.detail || error.response?.data?.message;
        Swal.showValidationMessage(backendMsg || `Request failed: ${error.message || error}`);
      }
    } : undefined,
    background: '#121214',
    color: '#ffffff',
    confirmButtonColor: '#3b82f6',
    cancelButtonColor: '#374151',
    customClass: {
      popup: 'border border-white/10 rounded-3xl bg-slate-900/95 text-white',
      title: '!text-xl !font-semibold !text-white !font-sans',
      htmlContainer: '!text-sm !text-slate-400 !font-sans',
      actions: 'gap-3',
      confirmButton: 'px-5 py-2.5 rounded-xl text-white font-medium bg-blue-600 hover:bg-blue-700 transition-colors',
      cancelButton: 'px-5 py-2.5 rounded-xl text-slate-300 font-medium bg-slate-800 hover:bg-slate-700 transition-colors',
      container: '!z-[999999]'
    },
    buttonsStyling: false
  });
  return result.isConfirmed;
};
